import os
import json
import logging
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

def call_gemini(prompt: str, system_instruction: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set")
    
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json"
        )
    )
    return response.text

def generate_exam(topic: str, content: str, num_questions: int = 10) -> dict:
    """
    Agent 1: Exam Designer.
    Generates a structured exam based on a topic and parsed PDF text content.
    Enforces a mix of:
    - 40% easy, 40% medium, 20% hard
    - 60% MCQ, 40% short answer
    """
    # Calculate counts based on num_questions
    # Default is 10 questions: 4 easy, 4 medium, 2 hard. 6 MCQ, 4 short answer.
    system_instruction = (
        "You are an expert exam designer. Generate a high-quality academic exam based on the provided topic and reference content.\n"
        "Return ONLY a valid JSON object matching the requested schema. No markdown (do not wrap in ```json blocks), no preamble, no explanation.\n"
        f"Constraint 1: The exam must contain exactly {num_questions} questions.\n"
        f"Constraint 2: Question difficulty distribution MUST be: 40% easy, 40% medium, 20% hard.\n"
        f"Constraint 3: Question type distribution MUST be: 60% MCQ, 40% short_answer.\n"
        "For MCQ (multiple choice) questions, options must contain exactly 4 unique choices, and correct_answer must be one of those choices.\n"
        "For short_answer questions, options must be an empty list [].\n"
        "Each question must have a unique id (e.g. q1, q2, ... qN), concept_tag, and cognitive_level ('recall', 'understanding', or 'application')."
    )

    prompt = (
        f"Topic: {topic}\n"
        f"Reference Content:\n{content}\n\n"
        f"Generate {num_questions} questions matching this exact schema:\n"
        "{\n"
        '  "topic": "string",\n'
        '  "questions": [\n'
        "    {\n"
        '      "id": "q1",\n'
        '      "text": "question text",\n'
        '      "type": "mcq" or "short_answer",\n'
        '      "options": ["choice1", "choice2", "choice3", "choice4"],\n'
        '      "correct_answer": "exact correct choice string (or answer content)",\n'
        '      "concept_tag": "specific concept being tested",\n'
        '      "difficulty": "easy" or "medium" or "hard",\n'
        '      "cognitive_level": "recall" or "understanding" or "application"\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    try:
        response_text = call_gemini(prompt, system_instruction)
        # Parse JSON
        return json.loads(response_text)
    except Exception as e:
        logger.warning(f"First attempt to design exam failed: {e}. Retrying with correction prompt...")
        correction_prompt = (
            f"{prompt}\n\n"
            f"ERROR IN PREVIOUS ATTEMPT: {e}\n"
            "Please fix the format error. Return ONLY the valid JSON object conforming exactly to the schema."
        )
        try:
            response_text = call_gemini(correction_prompt, system_instruction)
            return json.loads(response_text)
        except Exception as retry_e:
            logger.error(f"Retry to design exam failed: {retry_e}")
            raise ValueError(f"Failed to generate valid exam JSON from Gemini: {retry_e}")
