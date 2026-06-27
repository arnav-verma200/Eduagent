import os
import json
import logging
from typing import List, Dict, Any
from backend.utils.gemini import generate_with_fallback

logger = logging.getLogger(__name__)

def call_gemini(prompt: str, system_instruction: str) -> str:
    return generate_with_fallback(
        prompt=prompt,
        system_instruction=system_instruction,
        response_mime_type="application/json"
    )

def build_behavioral_signals(responses: List[Dict[str, Any]], evaluations: List[Dict[str, Any]], questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds structured behavioral signals dict from responses + evaluations + question metadata.
    Avoids sending raw student answers or full text, focusing on performance and timing patterns.
    """
    q_map = {q["id"]: q for q in questions}
    ev_map = {e["question_id"]: e for e in evaluations}
    
    question_signals = []
    total_time = 0
    total_questions = len(responses)
    scratchpads_provided = 0
    
    for resp in responses:
        q_id = resp.get("question_id")
        q = q_map.get(q_id, {})
        ev = ev_map.get(q_id, {})
        
        time_spent = resp.get("time_spent", 0)
        confidence = resp.get("confidence", 3)
        score = ev.get("score", 0)
        scratchpad = resp.get("scratchpad", "")
        copy_paste_detected = resp.get("copy_paste_detected", False)
        tab_change_detected = resp.get("tab_change_detected", False)
        
        has_scratchpad = bool(scratchpad and scratchpad.strip() and scratchpad != "No scratchpad provided")
        if has_scratchpad:
            scratchpads_provided += 1
            
        question_signals.append({
            "question_id": q_id,
            "difficulty": q.get("difficulty", "medium"),
            "type": q.get("type", "mcq"),
            "time_spent_seconds": time_spent,
            "confidence": confidence,
            "score": score,
            "has_scratchpad": has_scratchpad,
            "scratchpad_length": len(scratchpad) if scratchpad else 0,
            "reasoning_quality": ev.get("reasoning_quality", "absent"),
            "is_correct": ev.get("is_correct", False),
            "copy_paste_detected": copy_paste_detected,
            "tab_change_detected": tab_change_detected
        })
        total_time += time_spent
        
    avg_time = total_time / total_questions if total_questions > 0 else 0
    scratchpad_rate = scratchpads_provided / total_questions if total_questions > 0 else 0
    
    very_fast_answers = sum(1 for qs in question_signals if qs["time_spent_seconds"] < 5)
    copy_paste_count = sum(1 for qs in question_signals if qs["copy_paste_detected"])
    tab_change_count = sum(1 for qs in question_signals if qs["tab_change_detected"])
    
    return {
        "summary_metrics": {
            "total_questions": total_questions,
            "total_time_spent_seconds": total_time,
            "average_time_spent_seconds": avg_time,
            "scratchpad_rate": scratchpad_rate,
            "very_fast_answers_count": very_fast_answers,
            "copy_paste_violations_count": copy_paste_count,
            "tab_change_violations_count": tab_change_count
        },
        "question_level_signals": question_signals
    }

def analyze_integrity(responses: List[Dict[str, Any]], evaluations: List[Dict[str, Any]], questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Agent 4: Integrity Analyzer.
    Analyzes behavioral patterns (timing, confidence vs score, scratchpad utilization, reasoning quality consistency).
    Generates an integrity score (0-100) and highlights anomaly flags. Never makes definitive accusations.
    """
    behavioral_signals = build_behavioral_signals(responses, evaluations, questions)

    system_instruction = (
        "You are an expert educational integrity analyst.\n"
        "Analyze the provided behavioral signals of a student taking an exam and flag anomalies.\n"
        "Look for the following patterns:\n"
        "- Explicit violations: copy_paste_detected is true, or tab_change_detected is true. If either flag is true, create a high-severity flag immediately.\n"
        "- Timing anomalies: Very fast correct answers on hard or short answer questions (e.g. less than 5 seconds).\n"
        "- Confidence anomalies: High confidence (5) but extremely poor reasoning quality and incorrect answers; or correct answers with low confidence and no reasoning.\n"
        "- Reasoning anomalies: Correct answers on hard questions but with zero or absent reasoning quality, suggesting potential guessing or copy-pasting.\n"
        "- Pattern anomalies: Identical response times across multiple questions, or sudden changes in speed.\n\n"
        "CRITICAL RULES:\n"
        "1. Never make definitive accusations of cheating (e.g. do not say 'student cheated' or 'plagiarized').\n"
        "2. Frame all flags as anomalies with specific, objective evidence (e.g. 'Student triggered a tab-switch lock on question q2' or 'Copy-paste attempt blocked on question q3').\n"
        "3. Return an integrity_score from 0 to 100, where 100 means no anomalies. Deduct 15 to 20 points from the integrity score for every copy-paste or tab-change violation.\n"
        "4. Return ONLY a valid JSON object matching the requested schema. No markdown (do not wrap in ```json blocks), no preamble, no explanation."
    )

    prompt = (
        f"Behavioral Signals Data:\n"
        f"{json.dumps(behavioral_signals, indent=2)}\n\n"
        f"Analyze these signals and return a JSON matching this schema:\n"
        "{\n"
        '  "integrity_score": 0-100,\n'
        '  "flags": [\n'
        "    {\n"
        '      "type": "timing" | "confidence" | "reasoning" | "pattern",\n'
        '      "question_id": "string",\n'
        '      "evidence": "specific observation text",\n'
        '      "severity": "low" | "medium" | "high"\n'
        "    }\n"
        "  ],\n"
        '  "summary": "one sentence summarizing overall exam integrity patterns for the teacher"\n'
        "}"
    )

    try:
        response_text = call_gemini(prompt, system_instruction)
        return json.loads(response_text)
    except Exception as e:
        logger.warning(f"First attempt to analyze integrity failed: {e}. Retrying...")
        correction_prompt = (
            f"{prompt}\n\n"
            f"ERROR IN PREVIOUS ATTEMPT: {e}\n"
            "Please return ONLY the valid JSON object for this integrity analysis. Ensure it conforms exactly to the schema."
        )
        try:
            response_text = call_gemini(correction_prompt, system_instruction)
            return json.loads(response_text)
        except Exception as retry_e:
            logger.error(f"Retry failed to analyze integrity: {retry_e}")
            # Return safe default integrity profile on failure
            return {
                "integrity_score": 100,
                "flags": [],
                "summary": "Unable to calculate integrity metrics due to analyzer error."
            }
