import json
import logging
from typing import List, Dict, Any
from backend.utils.gemini import call_gemini_async, parse_json_response

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a Socratic examiner. Your job is to probe a student's understanding through targeted questioning — "
    "not to teach, not to hint, not to help. Only to expose what they truly understand vs what they think they understand.\n\n"
    "Rules:\n"
    "1. Never confirm or deny if the student is right until the debate ends.\n"
    "2. Ask ONE question at a time. Never explain.\n"
    "3. Start by asking them to defend their answer in their own words.\n"
    "4. With each response, identify the weakest point, logical jump, or missing link in their reasoning, and ask a targeted question about it.\n"
    "5. If they self-correct, probe whether the correction is genuine understanding or a lucky guess.\n"
    "6. Avoid generic or repetitive questions (e.g. do NOT say 'Can you elaborate further on that specific point?', 'Can you explain what you mean?', 'Why do you believe that?'). Instead, formulate a highly specific question referencing the domain-specific terms, physical laws, or components they mentioned (e.g., 'If magnetic flux is changing, what determines the direction of the induced current?', 'How does the primary winding turn count relate mathematically to the secondary voltage?').\n"
    "7. If the student asks for clarification (e.g. 'Which point?', 'Which part?', 'What do you mean?', or 'Which pt?'), you MUST explicitly specify the exact concept, physical component, or step in their previous explanation that you want them to elaborate on. Do not repeat a generic prompt.\n"
    "8. End after 4-6 exchanges OR when you have a clear diagnosis.\n"
    "9. When ending, set debate_complete true and fill diagnosis.\n\n"
    "Return ONLY valid JSON. No markdown (do not wrap in ```json blocks), no preamble, no explanation."
)


def turn_role(role: str) -> str:
    """Normalize roles to student and ai."""
    r = str(role).lower()
    if r in ["ai", "assistant", "teacher"]:
        return "ai"
    return "student"


async def _parse_debate_response(response_text: str, retry_prompt: str = None) -> Dict[str, Any]:
    """Parse and validate a Socratic debate JSON response, with one retry on failure."""
    try:
        return parse_json_response(response_text)
    except Exception as e:
        logger.warning(f"Failed to parse Socratic JSON response: {e}. Retrying once...")
        if retry_prompt:
            try:
                corrected_text = await call_gemini_async(retry_prompt, SYSTEM_PROMPT)
                return parse_json_response(corrected_text)
            except Exception as retry_e:
                logger.error(f"Retry failed to parse JSON: {retry_e}")
        return {
            "message": "I see. Let's examine that reasoning closer. Could you specify which part of the system or step in your logic you are referring to, and how it behaves?",
            "debate_complete": False,
            "diagnosis": None
        }


async def start_debate(question: Dict[str, Any], student_answer: str, original_error_type: str, original_feedback: str) -> Dict[str, Any]:
    prompt = (
        f"You are starting a Socratic debate. Probe the student's conceptual understanding based on this question:\n"
        f"Question: {question.get('text')}\n"
        f"Expected Correct Answer: {question.get('correct_answer')}\n\n"
        f"Student's Answer: \"{student_answer}\"\n"
        f"Original Assessment: {original_error_type}\n"
        f"Original Evaluator Feedback: \"{original_feedback}\"\n\n"
        f"INSTRUCTION:\n"
        f"Formulate the first Socratic questioning prompt. Ask the student to walk through their thinking process, "
        f"explain their reasoning, or defend their answer in their own words.\n\n"
        f"RULES FOR QUESTION:\n"
        f"1. Do NOT reveal, validate, confirm, or deny whether the student's answer is correct.\n"
        f"2. Ask exactly ONE question. Do not explain, teach, or lecture.\n"
        f"3. Frame the question referencing the specific terms or relationships described in the question/answer. Avoid generic prompts.\n\n"
        f"OUTPUT FORMAT:\n"
        f"Return ONLY a valid JSON object matching the schema below. No markdown wrapping, no text outside the JSON:\n"
        "{\n"
        '  "message": "Enter your targeted opening question here",\n'
        '  "debate_complete": false,\n'
        '  "diagnosis": null\n'
        "}"
    )

    retry_prompt = (
        f"{prompt}\n\n"
        f"ERROR: Your previous response was not valid JSON. Return ONLY a valid JSON object matching the requested schema."
    )

    try:
        res = await call_gemini_async(prompt, SYSTEM_PROMPT)
        return await _parse_debate_response(res, retry_prompt)
    except Exception as e:
        logger.error(f"Failed to start Socratic debate: {e}")
        return {
            "message": "Can you explain why you believe your answer is correct, and walk me through your thinking process?",
            "debate_complete": False,
            "diagnosis": None
        }

async def continue_debate(question: Dict[str, Any], student_answer: str, original_error_type: str, conversation_history: List[Dict[str, str]]) -> Dict[str, Any]:
    exchanges_count = len([c for c in conversation_history if turn_role(c.get("role")) == "student"])
    
    # Force debate_complete if limit reached (5 student messages means 5 exchanges)
    force_complete = exchanges_count >= 5

    history_str = ""
    for turn in conversation_history:
        role = turn_role(turn.get("role"))
        history_str += f"{role}: {turn.get('message')}\n"

    prompt = (
        f"You are conducting a Socratic debate. Analyze the conversation history and generate the next response.\n\n"
        f"Question Asked: {question.get('text')}\n"
        f"Expected Correct Answer: {question.get('correct_answer')}\n"
        f"Student's original exam answer: \"{student_answer}\"\n"
        f"Original error type: {original_error_type}\n\n"
        f"Conversation history so far:\n{history_str}\n"
        f"Number of exchanges (student turns) completed: {exchanges_count}\n\n"
    )

    if force_complete:
        prompt += (
            "CRITICAL: The debate must end NOW because we have reached the exchange limit.\n"
            "You MUST set \"debate_complete\": true and fill out the \"diagnosis\" object.\n"
        )
    else:
        prompt += (
            "INSTRUCTION FOR PROBING LOGIC:\n"
            "1. Read the student's latest response. Identify any vague concepts, logical gaps, or missing physical/conceptual mechanisms.\n"
            "2. Formulate a highly targeted, specific Socratic question about that exact mechanism. Do NOT ask generic questions like 'Can you explain further?' or 'Why do you believe that?'. Instead, point to a specific relationship or term they used.\n"
            "3. If the student asks for clarification (e.g. asking 'Which point?', 'Which part?', 'What do you mean?', or 'Which pt?'), you MUST immediately reference a specific part of their previous response and ask a concrete follow-up question. Do not repeat a generic prompt.\n"
            "4. Decide whether you have enough information to form a final diagnosis. If so, set \"debate_complete\": true and fill \"diagnosis\". Otherwise, set \"debate_complete\": false and \"diagnosis\": null.\n"
        )

    prompt += (
        "Return ONLY a valid JSON matching this schema:\n"
        "{\n"
        '  "message": "AI question to student (or summary explanation if ending)",\n'
        '  "debate_complete": boolean,\n'
        '  "diagnosis": null or {\n'
        '    "confirmed_error_type": "CONCEPTUAL_GAP" | "PROCEDURAL_ERROR" | "BLIND_SPOT" | "MISCALIBRATION" | "CORRECT_AFTER_PROBING",\n'
        '    "original_was_correct": boolean,\n'
        '    "depth": "shallow" | "deep",\n'
        '    "root_cause": "one precise sentence explaining what they misunderstood",\n'
        '    "teacher_note": "specific action the teacher should take for this student",\n'
        '    "confidence": 0-100 (integer)\n'
        '  }\n'
        "}"
    )

    retry_prompt = (
        f"{prompt}\n\n"
        f"ERROR: Your previous response was not valid JSON. Return ONLY a valid JSON object matching the requested schema."
    )

    try:
        res = await call_gemini_async(prompt, SYSTEM_PROMPT)
        parsed = await _parse_debate_response(res, retry_prompt)
        
        # Guard: Force completion if the exchanges have hit 6
        if exchanges_count >= 6 and not parsed.get("debate_complete"):
            parsed["debate_complete"] = True
            parsed["diagnosis"] = {
                "confirmed_error_type": original_error_type,
                "original_was_correct": False,
                "depth": "deep",
                "root_cause": "Exceeded debate exchanges limit. Preserving original gap diagnosis.",
                "teacher_note": "Student completed debate turns limit. Review full transcript for details.",
                "confidence": 50
            }
        return parsed
    except Exception as e:
        logger.error(f"Failed to continue Socratic debate: {e}")
        if exchanges_count >= 5:
            return {
                "message": "Thank you for defending your answer. We have completed the Socratic assessment.",
                "debate_complete": True,
                "diagnosis": {
                    "confirmed_error_type": original_error_type,
                    "original_was_correct": False,
                    "depth": "deep",
                    "root_cause": "Failed to invoke Socratic model for final diagnosis. Kept original assessment.",
                    "teacher_note": "Model failed to complete. Review raw answers.",
                    "confidence": 50
                }
            }
        return {
            "message": "Could you help me understand how your explanation addresses the core concepts of the question?",
            "debate_complete": False,
            "diagnosis": None
        }
