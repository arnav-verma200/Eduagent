import logging
import asyncio
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Dict, Any, List
from backend.db.supabase_client import get_supabase
from backend.utils.pdf_parser import parse_pdf_bytes
from backend.agents.exam_designer import generate_exam
from backend.agents.evaluator import evaluate_full_exam, evaluate_response
from backend.agents.adversarial import generate_probe_questions
from backend.agents.integrity import analyze_integrity
from backend.models.schemas import ExamSubmissionRequest, ProbeSubmissionRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exams", tags=["exams"])

@router.post("/generate")
async def generate_exam_endpoint(
    topic: str = Form(...),
    num_questions: int = Form(10),
    file: UploadFile = File(...)
):
    """
    Accepts: PDF upload + topic string.
    Parses PDF, calls Agent 1 (Exam Designer), stores exam in Supabase.
    """
    try:
        # Read file bytes
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
        # Parse PDF text
        parsed_text = parse_pdf_bytes(file_bytes)
        if not parsed_text:
            raise HTTPException(status_code=400, detail="No text could be extracted from the PDF.")
            
        # Run Exam Designer Agent
        exam_data = generate_exam(topic, parsed_text, num_questions=num_questions)
        
        # Save to Supabase
        supabase = get_supabase()
        db_response = supabase.table("exams").insert({
            "topic": topic,
            "questions": exam_data.get("questions", []),
            "created_by": "teacher_default"
        }).execute()
        
        if not db_response.data:
            raise HTTPException(status_code=500, detail="Failed to save exam to the database.")
            
        new_exam = db_response.data[0]
        return {
            "exam_id": new_exam["id"],
            "topic": new_exam["topic"],
            "questions": new_exam["questions"]
        }
    except ValueError as ve:
        logger.error(f"Value error in exam generation: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to generate exam: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("")
async def list_exams():
    """
    Lists all exams currently saved in Supabase.
    Useful for populating dashboards.
    """
    try:
        supabase = get_supabase()
        db_response = supabase.table("exams").select("id, topic, created_by, created_at").order("created_at", desc=True).execute()
        
        # Also fetch student counts and averages for each exam
        exams_list = db_response.data or []
        
        # Let's count student attempts for each exam
        for exam in exams_list:
            res_response = supabase.table("results").select("evaluation").eq("exam_id", exam["id"]).execute()
            results = res_response.data or []
            exam["student_count"] = len(results)
            
            if results:
                scores = []
                for r in results:
                    eval_data = r.get("evaluation") or {}
                    cog_profile = eval_data.get("cognitive_profile") or {}
                    score = cog_profile.get("score")
                    max_score = cog_profile.get("max_score", 100)
                    if score is not None and max_score > 0:
                        # Normalize to 100
                        scores.append((score / max_score) * 100)
                exam["average_score"] = round(sum(scores) / len(scores), 1) if scores else 0
            else:
                exam["average_score"] = 0
                
        return exams_list
    except Exception as e:
        logger.error(f"Failed to list exams: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{exam_id}")
async def get_exam(exam_id: str):
    """
    Retrieves a single exam and its questions.
    """
    try:
        supabase = get_supabase()
        db_response = supabase.table("exams").select("*").eq("id", exam_id).execute()
        if not db_response.data:
            raise HTTPException(status_code=404, detail="Exam not found.")
        return db_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get exam: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{exam_id}/submit")
async def submit_exam_endpoint(exam_id: str, payload: ExamSubmissionRequest):
    """
    Accepts: {student_id, responses: [{question_id, answer, scratchpad, confidence, time_spent}]}
    Runs Evaluator (Agent 2) -> Integrity (Agent 4) -> Adversarial Probe (Agent 3) in sequence.
    Stores full result in Supabase.
    """
    try:
        supabase = get_supabase()
        # Fetch the exam questions from database
        exam_response = supabase.table("exams").select("*").eq("id", exam_id).execute()
        if not exam_response.data:
            raise HTTPException(status_code=404, detail="Exam not found.")
        
        exam = exam_response.data[0]
        questions = exam.get("questions", [])
        topic = exam.get("topic", "Exam")
        
        student_id = payload.student_id
        responses = [r.model_dump() for r in payload.responses]
        
        # Run Cognitive Evaluator Agent (Agent 2)
        evaluation_result = await evaluate_full_exam(questions, responses)
        
        # Run Integrity Analyzer Agent (Agent 4)
        integrity_result = analyze_integrity(responses, evaluation_result["evaluations"], questions)
        
        # Extract blind spots and concept gaps from cognitive profile
        cog_profile = evaluation_result.get("cognitive_profile", {})
        blind_spots = cog_profile.get("blind_spots", [])
        concept_gaps = cog_profile.get("conceptual_gaps", [])
        
        # Run Adversarial Probe Agent (Agent 3)
        probe_result = generate_probe_questions(blind_spots, concept_gaps, topic)
        probe_questions = probe_result.get("probe_questions", [])
        
        # Save results to Supabase (upsert or insert)
        # Check if student already submitted this exam, if so overwrite or create new.
        # Let's delete previous results for this student on this exam to prevent clutter (or just insert new)
        # The spec says "Stores full result in Supabase results table". Let's insert.
        db_insert = supabase.table("results").insert({
            "exam_id": exam_id,
            "student_id": student_id,
            "evaluation": evaluation_result,
            "integrity": integrity_result,
            "probe_questions": {"probe_questions": probe_questions},
            "probe_evaluation": None,
            "gap_depth": None
        }).execute()
        
        if not db_insert.data:
            raise HTTPException(status_code=500, detail="Failed to save results to database.")
            
        return {
            "evaluation": evaluation_result,
            "integrity": integrity_result,
            "probe_questions": probe_questions
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit exam: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{exam_id}/probe/submit")
async def submit_probe_endpoint(exam_id: str, payload: ProbeSubmissionRequest):
    """
    Accepts: {student_id, responses: [...probe answers...]}
    Runs Agent 2 on probe answers.
    Determines gap_depth: "shallow" if probe score > 60%, "deep" if wrong again.
    Updates result in Supabase.
    """
    try:
        supabase = get_supabase()
        student_id = payload.student_id
        
        # Fetch the results row for this exam and student
        res_response = supabase.table("results")\
            .select("*")\
            .eq("exam_id", exam_id)\
            .eq("student_id", student_id)\
            .order("created_at", desc=True)\
            .execute()
            
        if not res_response.data:
            raise HTTPException(status_code=404, detail="Original test result not found for this student.")
            
        result_row = res_response.data[0]
        row_id = result_row["id"]
        probe_questions_payload = result_row.get("probe_questions") or {}
        probe_questions = probe_questions_payload.get("probe_questions", [])
        
        if not probe_questions:
            return {
                "gap_depth": "shallow",
                "message": "No probe questions were generated. Gap depth defaults to shallow."
            }
            
        # Map student answers by probe question ID
        responses_dict = {r.question_id: r.answer for r in payload.responses}
        
        # Evaluate each probe response using Agent 2
        # Since probe questions are standard short answers, we evaluate using mock scratchpad and default confidence/time
        probe_evaluations = []
        for pq in probe_questions:
            pq_id = pq["id"]
            student_answer = responses_dict.get(pq_id, "")
            
            # Construct mock response details for the evaluator
            resp_payload = {
                "question_id": pq_id,
                "answer": student_answer,
                "scratchpad": "No scratchpad provided for adversarial probe",
                "confidence": 5,
                "time_spent": 30
            }
            
            # Evaluate this question
            eval_res = await evaluate_response(pq, resp_payload)
            probe_evaluations.append(eval_res)
            
        # Determine gap depth: shallow if probe score > 60%, deep if <= 60%
        total_probe_score = sum(ev.get("score", 0) for ev in probe_evaluations)
        max_probe_score = len(probe_evaluations) * 10
        probe_percentage = (total_probe_score / max_probe_score) * 100 if max_probe_score > 0 else 0
        
        gap_depth = "shallow" if probe_percentage > 60 else "deep"
        
        # Update results in Supabase
        db_update = supabase.table("results").update({
            "probe_evaluation": {"evaluations": probe_evaluations, "score": total_probe_score, "max_score": max_probe_score},
            "gap_depth": gap_depth
        }).eq("id", row_id).execute()
        
        if not db_update.data:
            raise HTTPException(status_code=500, detail="Failed to update database with probe evaluations.")
            
        return {
            "gap_depth": gap_depth,
            "probe_evaluation": {
                "evaluations": probe_evaluations,
                "score": total_probe_score,
                "max_score": max_probe_score
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit probe answers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
