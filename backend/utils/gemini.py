import os
import re
import json
import time
import asyncio
import logging
from google import genai
from google.genai import types
from google.genai.errors import APIError

logger = logging.getLogger(__name__)

MODELS_CHAIN = [
    "gemma-4-26b",
    "gemma-4-31b",
    "antigravity-4-26b",
    "antigravity-4-31b",
    "anti-gravity-4-26b",
    "anti-gravity-4-31b",
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
]

# --- JSON Cleaning Utilities ---

def clean_json_response(text: str) -> str:
    """
    Strips markdown code fences, BOM characters, and whitespace from Gemini responses
    that are supposed to be raw JSON but often come wrapped in ```json ... ``` blocks.
    """
    if not text:
        return text
    
    # Strip BOM characters
    text = text.strip('\ufeff')
    
    # Strip markdown code fences: ```json ... ``` or ``` ... ```
    # This handles multiline responses wrapped in fences
    text = re.sub(r'^```(?:json)?\s*\n?', '', text.strip(), flags=re.IGNORECASE)
    text = re.sub(r'\n?```\s*$', '', text.strip())
    
    return text.strip()


def parse_json_response(text: str) -> dict:
    """
    Cleans a Gemini response string and parses it as JSON.
    Raises json.JSONDecodeError with a clear message if parsing fails.
    """
    cleaned = clean_json_response(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        # Log the raw text (truncated) to help debug
        preview = cleaned[:200] + "..." if len(cleaned) > 200 else cleaned
        logger.error(f"JSON parse failed. Preview: {preview}")
        raise json.JSONDecodeError(
            f"Failed to parse Gemini response as JSON: {e.msg}",
            e.doc,
            e.pos
        )


# --- Core Generation Functions ---

def generate_with_fallback(prompt: str, system_instruction: str = None, response_mime_type: str = None) -> str:
    """
    Sends generation request to Gemini models.
    If a transient error is caught, automatically tries the next model in the fallback chain.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set")
    
    client = genai.Client(api_key=api_key)
    
    last_error = None
    for model_name in MODELS_CHAIN:
        try:
            logger.info(f"Invoking Gemini model: {model_name}")
            
            # Setup configuration arguments
            config_args = {}
            if system_instruction:
                config_args["system_instruction"] = system_instruction
            if response_mime_type:
                config_args["response_mime_type"] = response_mime_type
                
            config = types.GenerateContentConfig(**config_args) if config_args else None
            
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            
            # Check for empty response text
            if not response.text:
                raise ValueError(f"Received empty response from model: {model_name}")
                
            return response.text
            
        except APIError as e:
            last_error = e
            # Check for transient/skip-eligible errors: 429 (Resource Exhausted), 408 (Timeout),
            # 5xx (Server Errors), 404 (Not Found / Unsupported Model), or specific error message indicators
            is_fallback_eligible = (
                e.code in [404, 429, 408, 500, 502, 503, 504] or
                (e.code is not None and e.code >= 500) or
                any(msg in str(e).upper() for msg in [
                    "RESOURCE_EXHAUSTED", "RATE_LIMIT", "UNAVAILABLE", 
                    "HIGH_DEMAND", "TEMPORARY", "OVERLOADED", "TIMEOUT", 
                    "503", "500", "NOT_FOUND", "404", "NOT FOUND"
                ])
            )
            if is_fallback_eligible:
                logger.warning(f"Model {model_name} failed with fallback-eligible error ({e.code or 'unknown'}). Advancing to next fallback in chain...")
                time.sleep(1.5)  # Wait briefly to let the connection pool settle
                continue
            else:
                # Other API errors (e.g. 400 Bad Request, invalid key) fail immediately
                logger.error(f"Gemini API Error ({e.code}) with model {model_name}: {e.message}")
                raise e
        except Exception as e:
            last_error = e
            logger.warning(f"Unexpected error calling model {model_name}: {e}. Advancing fallback...")
            time.sleep(1)
            continue
            
    logger.error("All Gemini models in the fallback chain were exhausted or failed.")
    if last_error is not None:
        raise last_error
    raise RuntimeError("All Gemini models in the fallback chain were exhausted or failed without registering an exception.")


async def generate_with_fallback_async(prompt: str, system_instruction: str = None, response_mime_type: str = None) -> str:
    """
    Async variant of generate_with_fallback that runs the blocking call in a thread pool
    to avoid blocking the FastAPI event loop.
    """
    return await asyncio.to_thread(
        generate_with_fallback,
        prompt=prompt,
        system_instruction=system_instruction,
        response_mime_type=response_mime_type
    )


# --- Centralized Agent Helpers ---
# These replace the per-agent call_gemini() wrappers

def call_gemini(prompt: str, system_instruction: str, response_mime_type: str = "application/json") -> str:
    """Synchronous Gemini call with JSON mime type (used by blocking agent functions)."""
    return generate_with_fallback(
        prompt=prompt,
        system_instruction=system_instruction,
        response_mime_type=response_mime_type
    )


async def call_gemini_async(prompt: str, system_instruction: str, response_mime_type: str = "application/json") -> str:
    """Async Gemini call that won't block the event loop."""
    return await generate_with_fallback_async(
        prompt=prompt,
        system_instruction=system_instruction,
        response_mime_type=response_mime_type
    )
