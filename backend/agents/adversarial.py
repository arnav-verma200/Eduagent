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

def generate_probe_questions(blind_spots: List[str], concept_gaps: List[str], original_topic: str) -> dict:
    """
    Agent 3: Adversarial Probe.
    Generates exactly 3 targeted follow-up questions harder than what the student got wrong.
    If no gaps/blind spots are found, returns an empty list.
    """
    # If no gaps, return empty list immediately
    if not blind_spots and not concept_gaps:
        return {"probe_questions": []}

    system_instruction = (
        "You are an expert adversarial educational assessor. Your goal is to construct a follow-up probe exam.\n"
        "Generate EXACTLY 3 challenging short-answer questions targeting the identified conceptual gaps and blind spots in the topic.\n"
        "These questions must be harder than standard recall, aiming to distinguish shallow gaps (simple forgetfulness) from deep gaps (fundamental misconceptions).\n"
        "Return ONLY a valid JSON object matching the requested schema. No markdown (do not wrap in ```json blocks), no preamble, no explanation."
    )

    prompt = (
        f"Original Topic: {original_topic}\n"
        f"Student's Blind Spots: {blind_spots}\n"
        f"Student's Conceptual Gaps: {concept_gaps}\n\n"
        f"Generate exactly 3 probe questions matching this schema:\n"
        "{\n"
        '  "probe_questions": [\n'
        "    {\n"
        '      "id": "p1",\n'
        '      "text": "challenging follow-up question text",\n'
        '      "targets_gap": "which conceptual gap or blind spot this question tests",\n'
        '      "why_harder": "brief explanation of what deep understanding this probes and why it is harder",\n'
        '      "correct_answer": "the expected model short answer description",\n'
        '      "type": "short_answer"\n'
        "    },\n"
        "    ...\n"
        "  ]\n"
        "}"
    )

    try:
        response_text = call_gemini(prompt, system_instruction)
        return json.loads(response_text)
    except Exception as e:
        logger.warning(f"First attempt to generate probe failed: {e}. Retrying...")
        correction_prompt = (
            f"{prompt}\n\n"
            f"ERROR IN PREVIOUS ATTEMPT: {e}\n"
            "Please fix the format error. Return ONLY the valid JSON object conforming to the schema."
        )
        try:
            response_text = call_gemini(correction_prompt, system_instruction)
            return json.loads(response_text)
        except Exception as retry_e:
            logger.error(f"Retry failed to generate probes: {retry_e}")
            # Return empty probe questions on failure so flow continues
            return {"probe_questions": []}
