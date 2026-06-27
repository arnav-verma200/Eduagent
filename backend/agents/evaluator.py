import json
import logging
import asyncio
from typing import List, Dict, Any
from backend.utils.gemini import call_gemini_async, parse_json_response

logger = logging.getLogger(__name__)

# Limit concurrent Gemini calls to avoid triggering rate limits on free tier
_GEMINI_SEMAPHORE = asyncio.Semaphore(3)

async def evaluate_response(question: Dict[str, Any], response_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Agent 2: Cognitive Evaluator.
    Evaluates student answer, scratchpad reasoning, confidence, and time spent for a single question.
    """
    student_answer = response_dict.get("answer", "")
    scratchpad = response_dict.get("scratchpad", "No scratchpad provided")
    confidence = response_dict.get("confidence", 3)
    time_spent = response_dict.get("time_spent", 0)

    system_instruction = (
        "You are an expert cognitive evaluator. Evaluate a student's answer and scratchpad reasoning for a given question.\n"
        "Return ONLY a valid JSON object matching the requested schema. No markdown (do not wrap in ```json blocks), no preamble, no explanation.\n"
        "Classify the error_type into exactly one of these: CORRECT, CONCEPTUAL_GAP, PROCEDURAL_ERROR, BLIND_SPOT, MISCALIBRATION, PARTIAL.\n"
        "Definitions:\n"
        "- CORRECT: Correct answer (usually score 9-10). If confidence was low (1-2), classify as MISCALIBRATION instead.\n"
        "- CONCEPTUAL_GAP: Wrong answer due to flawed mental model of the concept.\n"
        "- PROCEDURAL_ERROR: Correct conceptual path, but execution broke down (e.g. calculation slip, syntax typo).\n"
        "- BLIND_SPOT: Incorrect answer + high confidence (4 or 5) + weak or absent scratchpad reasoning.\n"
        "- MISCALIBRATION: Correct answer + low confidence (1 or 2) (they know more than they think).\n"
        "- PARTIAL: Partially correct with specific gaps.\n\n"
        "Rules:\n"
        "1. Score must be an integer from 0 to 10.\n"
        "2. concept_gap should be a specific concept missed (null if correct/calibrated).\n"
        "3. reasoning_quality must be exactly one of: strong, weak, absent.\n"
        "4. feedback must be exactly one sentence explaining where the thinking broke down.\n"
        "5. confidence_accuracy must be exactly one of: overconfident, underconfident, calibrated."
    )

    prompt = (
        f"Question Details:\n"
        f"Text: {question.get('text')}\n"
        f"Type: {question.get('type')}\n"
        f"Options: {question.get('options')}\n"
        f"Correct Answer: {question.get('correct_answer')}\n"
        f"Concept Tag: {question.get('concept_tag')}\n\n"
        f"Student Submission:\n"
        f"Answer: {student_answer}\n"
        f"Scratchpad (Thinking Process): {scratchpad}\n"
        f"Confidence Level (1-5): {confidence}\n"
        f"Time Spent (seconds): {time_spent}\n\n"
        f"Evaluate this submission and return JSON in this schema:\n"
        "{\n"
        '  "question_id": "string",\n'
        '  "is_correct": boolean,\n'
        '  "score": 0-10,\n'
        '  "error_type": "CORRECT" | "CONCEPTUAL_GAP" | "PROCEDURAL_ERROR" | "BLIND_SPOT" | "MISCALIBRATION" | "PARTIAL",\n'
        '  "concept_gap": "specific concept tag or detail missed (string or null)",\n'
        '  "reasoning_quality": "strong" | "weak" | "absent",\n'
        '  "feedback": "one sentence feedback on their thinking",\n'
        '  "confidence_accuracy": "overconfident" | "underconfident" | "calibrated"\n'
        "}"
    )

    # Inject question_id in prompt to ensure match
    q_id = question.get("id", "unknown")
    
    async def _do_evaluate(eval_prompt: str) -> Dict[str, Any]:
        """Run the Gemini call with semaphore to limit concurrency."""
        async with _GEMINI_SEMAPHORE:
            response_text = await call_gemini_async(eval_prompt, system_instruction)
        result = parse_json_response(response_text)
        result["question_id"] = q_id
        result["answer"] = student_answer
        result["scratchpad"] = scratchpad
        result["question_text"] = question.get("text")
        result["question_type"] = question.get("type")
        result["options"] = question.get("options", [])
        result["correct_answer"] = question.get("correct_answer")
        return result

    try:
        return await _do_evaluate(prompt)
    except Exception as e:
        logger.warning(f"First attempt to evaluate question {q_id} failed: {e}. Retrying...")
        correction_prompt = (
            f"{prompt}\n\n"
            f"ERROR IN PREVIOUS ATTEMPT: {e}\n"
            "Please return ONLY the valid JSON object for this evaluation. Ensure it conforms exactly to the schema."
        )
        try:
            return await _do_evaluate(correction_prompt)
        except Exception as retry_e:
            logger.error(f"Retry failed for question {q_id}: {retry_e}")
            # Return a fallback evaluation structure so the pipeline doesn't break
            is_correct = (str(student_answer).strip().lower() == str(question.get("correct_answer")).strip().lower())
            return {
                "question_id": q_id,
                "is_correct": is_correct,
                "score": 10 if is_correct else 0,
                "error_type": "CORRECT" if is_correct else "CONCEPTUAL_GAP",
                "concept_gap": None if is_correct else question.get("concept_tag"),
                "reasoning_quality": "weak" if scratchpad and scratchpad != "No scratchpad provided" else "absent",
                "feedback": "Evaluation fell back due to API error." if not is_correct else "Correct answer.",
                "confidence_accuracy": "calibrated",
                "answer": student_answer,
                "scratchpad": scratchpad,
                "question_text": question.get("text"),
                "question_type": question.get("type"),
                "options": question.get("options", []),
                "correct_answer": question.get("correct_answer")
            }

async def evaluate_full_exam(questions: List[Dict[str, Any]], responses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates all questions in parallel (with concurrency limit via semaphore), aggregates scores and profiles.
    """
    # Create lookup map for questions by ID
    q_map = {q["id"]: q for q in questions}
    
    tasks = []
    for resp in responses:
        q_id = resp.get("question_id")
        if q_id in q_map:
            tasks.append(evaluate_response(q_map[q_id], resp))
            
    evaluations = await asyncio.gather(*tasks)
    
    # Aggregation
    blind_spots = []
    conceptual_gaps = []
    error_counts = {}
    total_score = 0
    max_score = len(evaluations) * 10
    
    for ev in evaluations:
        total_score += ev.get("score", 0)
        err_type = ev.get("error_type")
        
        # Track dominant error
        error_counts[err_type] = error_counts.get(err_type, 0) + 1
        
        # Track blind spots (from BLIND_SPOT error type or concept gaps)
        if err_type == "BLIND_SPOT":
            blind_spots.append(ev.get("concept_gap") or "Unknown Concept")
        
        if err_type in ["CONCEPTUAL_GAP", "PARTIAL"] and ev.get("concept_gap"):
            conceptual_gaps.append(ev.get("concept_gap"))
            
    # Find dominant error type (excluding CORRECT if other errors exist)
    non_correct_errors = {k: v for k, v in error_counts.items() if k != "CORRECT"}
    if non_correct_errors:
        dominant_error_type = max(non_correct_errors, key=non_correct_errors.get)
    else:
        dominant_error_type = "CORRECT" if "CORRECT" in error_counts else "NONE"
        
    return {
        "evaluations": evaluations,
        "cognitive_profile": {
            "blind_spots": list(set(blind_spots)),
            "conceptual_gaps": list(set(conceptual_gaps)),
            "dominant_error_type": dominant_error_type,
            "score": total_score,
            "max_score": max_score
        }
    }
