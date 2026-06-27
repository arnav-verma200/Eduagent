import logging
from fastapi import APIRouter, HTTPException
from backend.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["students"])

@router.get("/api/exams/{exam_id}/student/{student_id}")
async def get_student_report(exam_id: str, student_id: str):
    """
    Returns individual student cognitive fingerprint report for a specific exam.
    Matches database result evaluations back to the original question definitions.
    """
    try:
        supabase = get_supabase()
        
        # Fetch the latest result for this student and exam
        res_response = supabase.table("results")\
            .select("*")\
            .eq("exam_id", exam_id)\
            .eq("student_id", student_id)\
            .order("created_at", desc=True)\
            .execute()
            
        if not res_response.data:
            raise HTTPException(status_code=404, detail="Student report not found for this exam.")
            
        result = res_response.data[0]
        
        # Fetch exam questions to enrich report with original question text
        exam_response = supabase.table("exams").select("*").eq("id", exam_id).execute()
        if not exam_response.data:
            raise HTTPException(status_code=404, detail="Original exam details not found.")
            
        exam = exam_response.data[0]
        questions = exam.get("questions", [])
        q_map = {q["id"]: q for q in questions}
        
        # Enrich evaluations with original question content
        eval_data = result.get("evaluation") or {}
        evaluations_list = eval_data.get("evaluations") or []
        
        enriched_evaluations = []
        for ev in evaluations_list:
            q_id = ev.get("question_id")
            original_q = q_map.get(q_id, {})
            enriched_evaluations.append({
                **ev,
                "question_text": original_q.get("text"),
                "question_type": original_q.get("type"),
                "options": original_q.get("options", []),
                "correct_answer": original_q.get("correct_answer")
            })
            
        eval_data["evaluations"] = enriched_evaluations
        result["evaluation"] = eval_data
        result["exam_topic"] = exam.get("topic", "Exam")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get student report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/students/{student_id}/submissions")
async def get_student_submissions(student_id: str):
    """
    Retrieves all submissions/reports for a specific student.
    Used for a student's personal landing page.
    """
    try:
        supabase = get_supabase()
        
        # Fetch all results for this student
        res_response = supabase.table("results")\
            .select("id, exam_id, evaluation, created_at, gap_depth")\
            .eq("student_id", student_id)\
            .order("created_at", desc=True)\
            .execute()
            
        submissions = res_response.data or []
        enriched_submissions = []
        
        for sub in submissions:
            exam_id = sub["exam_id"]
            # Fetch exam topic
            exam_resp = supabase.table("exams").select("topic").eq("id", exam_id).execute()
            topic = exam_resp.data[0]["topic"] if exam_resp.data else "Unknown Exam"
            
            eval_data = sub.get("evaluation") or {}
            cog_profile = eval_data.get("cognitive_profile") or {}
            
            enriched_submissions.append({
                "result_id": sub["id"],
                "exam_id": exam_id,
                "exam_topic": topic,
                "score": cog_profile.get("score", 0),
                "max_score": cog_profile.get("max_score", 100),
                "dominant_error_type": cog_profile.get("dominant_error_type", "NONE"),
                "gap_depth": sub.get("gap_depth"),
                "created_at": sub["created_at"]
            })
            
        return enriched_submissions
    except Exception as e:
        logger.error(f"Failed to get student submissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
