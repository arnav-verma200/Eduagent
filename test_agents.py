import os
import json
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Mock data
mock_questions = [
    {
        "id": "q1",
        "text": "What is the time complexity of searching in a balanced Binary Search Tree (BST)?",
        "type": "mcq",
        "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        "correct_answer": "O(log n)",
        "concept_tag": "BST search complexity",
        "difficulty": "medium",
        "cognitive_level": "recall"
    },
    {
        "id": "q2",
        "text": "Explain why quicksort has a worst-case time complexity of O(n^2).",
        "type": "short_answer",
        "options": [],
        "correct_answer": "Quicksort worst case occurs when the pivot consistently partitions the array into unbalanced sub-arrays (e.g. sorted list with first/last element pivot).",
        "concept_tag": "Quicksort worst case",
        "difficulty": "hard",
        "cognitive_level": "understanding"
    }
]

mock_responses = [
    {
        "question_id": "q1",
        "answer": "O(log n)",
        "scratchpad": "Balanced BST splits the search space in half at each step, so height is log n. Searching takes O(height) which is O(log n).",
        "confidence": 5,
        "time_spent": 12
    },
    {
        "question_id": "q2",
        "answer": "Quicksort worst case is when pivot is bad.",
        "scratchpad": "I am not entirely sure, but a bad pivot means we do n comparisons n times.",
        "confidence": 2,
        "time_spent": 8
    }
]

async def run_tests():
    print("=== EduAgent Agents Code Validation ===")
    
    # 1. Test Imports
    try:
        from backend.agents.exam_designer import generate_exam
        from backend.agents.evaluator import evaluate_full_exam
        from backend.agents.adversarial import generate_probe_questions
        from backend.agents.integrity import analyze_integrity
        print("[SUCCESS] All agent modules imported successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to import agent modules: {e}")
        return

    # 2. Check API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[INFO] GEMINI_API_KEY is not set. Skipping active API integration tests.")
        print("[INFO] Offline testing complete.")
        return
        
    print(f"[INFO] GEMINI_API_KEY is configured. Running active agent API tests...")
    
    # 3. Test Evaluator Agent
    print("\nTesting Evaluator Agent...")
    try:
        evaluation = await evaluate_full_exam(mock_questions, mock_responses)
        print("[SUCCESS] Evaluator ran successfully.")
        print(json.dumps(evaluation, indent=2))
        
        # 4. Test Adversarial Probe Agent
        print("\nTesting Adversarial Probe Agent...")
        cog_profile = evaluation.get("cognitive_profile", {})
        blind_spots = cog_profile.get("blind_spots", [])
        concept_gaps = cog_profile.get("conceptual_gaps", [])
        
        probe_res = await generate_probe_questions(blind_spots, concept_gaps, "Algorithms and Data Structures")
        print("[SUCCESS] Adversarial Probe ran successfully.")
        print(json.dumps(probe_res, indent=2))
        
        # 5. Test Integrity Agent
        print("\nTesting Integrity Analyzer Agent...")
        integrity_res = await analyze_integrity(mock_responses, evaluation["evaluations"], mock_questions)
        print("[SUCCESS] Integrity Analyzer ran successfully.")
        print(json.dumps(integrity_res, indent=2))
        
    except Exception as e:
        print(f"[ERROR] Active API testing failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_tests())
