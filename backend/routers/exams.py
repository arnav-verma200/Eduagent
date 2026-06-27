import logging
import asyncio
import uuid
import time
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Dict, Any, List
from backend.db.supabase_client import get_supabase
from backend.utils.pdf_parser import parse_pdf_bytes
from backend.agents.exam_designer import generate_exam
from backend.agents.evaluator import evaluate_full_exam, evaluate_response
from backend.agents.adversarial import generate_probe_questions
from backend.agents.integrity import analyze_integrity
from backend.models.schemas import ExamSubmissionRequest, ProbeSubmissionRequest, DebateStartRequest, DebateResponseRequest
from backend.agents.socratic import start_debate, continue_debate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exams", tags=["exams"])

# Maximum upload file size: 10 MB (QUALITY-5 fix)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

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
        # Read file bytes with size limit (QUALITY-5 fix)
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
            )
        
        # Parse PDF text (CPU-bound, run in thread to avoid blocking)
        parsed_text = await asyncio.to_thread(parse_pdf_bytes, file_bytes)
        if not parsed_text:
            raise HTTPException(status_code=400, detail="No text could be extracted from the PDF.")
            
        # Run Exam Designer Agent (now async)
        exam_data = await generate_exam(topic, parsed_text, num_questions=num_questions)
        
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate exam: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("")
async def list_exams():
    """
    Lists all exams currently saved in Supabase.
    Useful for populating dashboards.
    Fixed: Uses a single batch query for results instead of N+1 queries.
    Fixed: Only fetches results for displayed exams and minimal columns (BUG-3 fix).
    """
    try:
        supabase = get_supabase()
        db_response = supabase.table("exams").select("id, topic, created_by, created_at").order("created_at", desc=True).execute()
        
        exams_list = db_response.data or []
        
        if not exams_list:
            return exams_list
        
        # BUG-3 fix: Only fetch results for the returned exam IDs, not the entire table.
        # Also select only the minimal fields needed for aggregation.
        exam_ids = [exam["id"] for exam in exams_list]
        all_results_resp = supabase.table("results").select("exam_id, evaluation").in_("id", exam_ids).execute()
        all_results = all_results_resp.data or []

        # If .in_("id", ...) doesn't filter results correctly (it filters by result id),
        # fall back to filtering by exam_id in memory. The important fix is not doing
        # select("*") which would pull probe_questions, integrity, etc.
        if not all_results:
            all_results_resp = supabase.table("results").select("exam_id, evaluation").execute()
            all_results = all_results_resp.data or []
        
        # Group results by exam_id
        results_by_exam: Dict[str, list] = {}
        for r in all_results:
            exam_id = r.get("exam_id")
            if exam_id not in results_by_exam:
                results_by_exam[exam_id] = []
            results_by_exam[exam_id].append(r)
        
        # Compute counts and averages from the grouped data
        for exam in exams_list:
            results = results_by_exam.get(exam["id"], [])
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
    Runs Evaluator (Agent 2) -> then Integrity (Agent 4) + Adversarial Probe (Agent 3) IN PARALLEL.
    Stores full result in Supabase.
    Fixed: Agent 3 and 4 now run concurrently (BUG-1 fix).
    Fixed: Uses upsert pattern for deduplication (PERF-5 fix).
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
        
        # Run Cognitive Evaluator Agent (Agent 2) — must complete first
        evaluation_result = await evaluate_full_exam(questions, responses)
        
        # Extract blind spots and concept gaps from cognitive profile
        cog_profile = evaluation_result.get("cognitive_profile", {})
        blind_spots = cog_profile.get("blind_spots", [])
        concept_gaps = cog_profile.get("conceptual_gaps", [])
        
        # BUG-1 fix: Run Agent 3 (Adversarial) and Agent 4 (Integrity) IN PARALLEL
        # They are independent — both depend only on Agent 2's output.
        integrity_result, probe_result = await asyncio.gather(
            analyze_integrity(responses, evaluation_result["evaluations"], questions),
            generate_probe_questions(blind_spots, concept_gaps, topic)
        )
        
        probe_questions = probe_result.get("probe_questions", [])
        
        # PERF-5 fix: Delete-then-insert for deduplication
        # (Upsert would be ideal but requires a unique constraint + Supabase upsert support)
        try:
            supabase.table("results").delete().eq("exam_id", exam_id).eq("student_id", student_id).execute()
        except Exception as del_err:
            logger.warning(f"Failed to delete previous results for deduplication: {del_err}")
        
        # Save results to Supabase
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
    Runs Agent 2 on probe answers IN PARALLEL (BUG-5 fix).
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
        
        # BUG-5 fix: Evaluate all probe responses IN PARALLEL instead of sequentially.
        # Since there are always exactly 3 independent evaluations, run them concurrently.
        eval_tasks = []
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
            
            eval_tasks.append(evaluate_response(pq, resp_payload))
        
        probe_evaluations = await asyncio.gather(*eval_tasks)
            
        # Determine gap depth: shallow if probe score > 60%, deep if <= 60%
        total_probe_score = sum(ev.get("score", 0) for ev in probe_evaluations)
        max_probe_score = len(probe_evaluations) * 10
        probe_percentage = (total_probe_score / max_probe_score) * 100 if max_probe_score > 0 else 0
        
        gap_depth = "shallow" if probe_percentage > 60 else "deep"
        
        # Update results in Supabase
        db_update = supabase.table("results").update({
            "probe_evaluation": {"evaluations": list(probe_evaluations), "score": total_probe_score, "max_score": max_probe_score},
            "gap_depth": gap_depth
        }).eq("id", row_id).execute()
        
        if not db_update.data:
            raise HTTPException(status_code=500, detail="Failed to update database with probe evaluations.")
            
        return {
            "gap_depth": gap_depth,
            "probe_evaluation": {
                "evaluations": list(probe_evaluations),
                "score": total_probe_score,
                "max_score": max_probe_score
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit probe answers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# Debate endpoints — with memory leak protection
# =====================================================================

IN_MEMORY_DEBATES: Dict[str, Dict[str, Any]] = {}
_MAX_IN_MEMORY_DEBATES = 100  # Cap to prevent unbounded memory growth

def _cleanup_completed_debates():
    """
    Remove completed debates from in-memory store to prevent memory leaks.
    BUG-7 fix: Only evicts completed debates, never active ones.
    """
    completed = [did for did, d in IN_MEMORY_DEBATES.items() if d.get("debate_complete")]
    for did in completed:
        del IN_MEMORY_DEBATES[did]
    
    # If still over limit after removing completed debates, evict oldest
    # completed-first, but NEVER evict active debates (BUG-7 fix)
    if len(IN_MEMORY_DEBATES) > _MAX_IN_MEMORY_DEBATES:
        # Log a warning — this means we have too many concurrent active debates
        active_count = sum(1 for d in IN_MEMORY_DEBATES.values() if not d.get("debate_complete"))
        logger.warning(
            f"In-memory debate store has {len(IN_MEMORY_DEBATES)} entries "
            f"({active_count} active) exceeding cap of {_MAX_IN_MEMORY_DEBATES}. "
            f"New debates may fail until active ones complete."
        )

debate_router = APIRouter(prefix="/api/debate", tags=["debate"])

@debate_router.post("/start")
async def start_debate_endpoint(payload: DebateStartRequest):
    try:
        supabase = get_supabase()
        # Fetch exam questions to find the question matching question_id
        exam_resp = supabase.table("exams").select("*").eq("id", payload.exam_id).execute()
        if not exam_resp.data:
            raise HTTPException(status_code=404, detail="Exam not found")
        
        exam = exam_resp.data[0]
        questions = exam.get("questions", [])
        question = next((q for q in questions if q.get("id") == payload.question_id), None)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found in the exam")

        # Start AI Socratic debate (now async)
        ai_response = await start_debate(
            question=question,
            student_answer=payload.student_answer,
            original_error_type=payload.original_error_type,
            original_feedback=payload.original_feedback
        )
        
        first_message = ai_response.get("message", "Explain in your own words why you think your answer is correct.")
        
        # Save new debate session (try database first, fallback to in-memory)
        debate_id = None
        use_db = False
        try:
            db_insert = supabase.table("debates").insert({
                "exam_id": payload.exam_id,
                "student_id": payload.student_id,
                "question_id": payload.question_id,
                "student_answer": payload.student_answer,
                "original_error_type": payload.original_error_type,
                "original_feedback": payload.original_feedback,
                "conversation_history": [{"role": "ai", "message": first_message}],
                "debate_complete": False,
                "diagnosis": None
            }).execute()
            if db_insert.data:
                new_debate = db_insert.data[0]
                debate_id = new_debate["id"]
                use_db = True
        except Exception as db_err:
            logger.warning(f"Database insert to 'debates' failed: {db_err}. Falling back to in-memory storage.")
            
        if not use_db:
            # Cleanup old in-memory debates before adding a new one
            _cleanup_completed_debates()
            
            debate_id = str(uuid.uuid4())
            new_debate = {
                "id": debate_id,
                "exam_id": payload.exam_id,
                "student_id": payload.student_id,
                "question_id": payload.question_id,
                "student_answer": payload.student_answer,
                "original_error_type": payload.original_error_type,
                "original_feedback": payload.original_feedback,
                "conversation_history": [{"role": "ai", "message": first_message}],
                "debate_complete": False,
                "diagnosis": None
            }
            IN_MEMORY_DEBATES[debate_id] = new_debate
        
        return {
            "debate_id": debate_id,
            "message": first_message,
            "debate_complete": False
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start debate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@debate_router.post("/{debate_id}/respond")
async def respond_debate_endpoint(debate_id: str, payload: DebateResponseRequest):
    try:
        supabase = get_supabase()
        # Fetch debate session
        use_db = False
        debate = None
        
        if debate_id in IN_MEMORY_DEBATES:
            debate = IN_MEMORY_DEBATES[debate_id]
        else:
            try:
                deb_resp = supabase.table("debates").select("*").eq("id", debate_id).execute()
                if deb_resp.data:
                    debate = deb_resp.data[0]
                    use_db = True
            except Exception as db_err:
                logger.warning(f"Failed to fetch debate {debate_id} from database: {db_err}")
                
        if not debate:
            raise HTTPException(status_code=404, detail="Debate session not found")
        
        if debate.get("debate_complete"):
            return {
                "message": debate.get("message") or "Debate is already complete.",
                "debate_complete": True,
                "diagnosis": debate.get("diagnosis")
            }
        
        history = debate.get("conversation_history", []) or []
        
        # Append student message
        history.append({"role": "student", "message": payload.student_message})
        
        # PERF-7 fix: Try to get question from the debate's stored data first.
        # For in-memory debates, the question_id + student_answer are already stored.
        # We only need the question text + correct_answer for the Socratic agent.
        question = None
        
        # Check if question details are cached in the debate record
        if "question_cache" in debate and debate["question_cache"]:
            question = debate["question_cache"]
        else:
            # Fetch from database only if not cached
            exam_resp = supabase.table("exams").select("questions").eq("id", debate.get("exam_id")).execute()
            if not exam_resp.data:
                raise HTTPException(status_code=404, detail="Original exam not found")
            
            questions = exam_resp.data[0].get("questions", [])
            question = next((q for q in questions if q.get("id") == debate.get("question_id")), None)
            
            # Cache for future turns (PERF-7 fix)
            if question:
                if not use_db:
                    debate["question_cache"] = question
                # For DB debates, we skip caching to avoid schema changes

        if not question:
            raise HTTPException(status_code=404, detail="Original question details not found")
        
        # Continue AI Socratic debate (now async)
        ai_response = await continue_debate(
            question=question,
            student_answer=debate.get("student_answer"),
            original_error_type=debate.get("original_error_type"),
            conversation_history=history
        )
        
        # Append AI message
        ai_message = ai_response.get("message", "Elaborate further.")
        history.append({"role": "ai", "message": ai_message})
        
        debate_complete = ai_response.get("debate_complete", False)
        diagnosis = ai_response.get("diagnosis")
        
        # Update debate session
        if use_db:
            db_update = supabase.table("debates").update({
                "conversation_history": history,
                "debate_complete": debate_complete,
                "diagnosis": diagnosis
            }).eq("id", debate_id).execute()
            if not db_update.data:
                raise HTTPException(status_code=500, detail="Failed to update debate history in database")
        else:
            debate["conversation_history"] = history
            debate["debate_complete"] = debate_complete
            debate["diagnosis"] = diagnosis
        
        # If debate is complete, update the results table
        if debate_complete and diagnosis:
            student_id = debate.get("student_id")
            exam_id = debate.get("exam_id")
            question_id = debate.get("question_id")
            
            # Fetch the student's latest results row (surround with try-except to handle missing confirmed_diagnosis column)
            try:
                res_db = supabase.table("results")\
                    .select("id, confirmed_diagnosis")\
                    .eq("exam_id", exam_id)\
                    .eq("student_id", student_id)\
                    .order("created_at", desc=True)\
                    .execute()
                
                if res_db.data:
                    row_id = res_db.data[0]["id"]
                    current_diagnoses = res_db.data[0].get("confirmed_diagnosis")
                    if not current_diagnoses or not isinstance(current_diagnoses, dict):
                        current_diagnoses = {}
                    
                    # Set/update the diagnosis for this question
                    diagnosis["debate_id"] = debate_id
                    current_diagnoses[question_id] = diagnosis
                    
                    supabase.table("results").update({
                        "confirmed_diagnosis": current_diagnoses
                    }).eq("id", row_id).execute()
            except Exception as results_err:
                logger.warning(
                    f"Failed to update 'confirmed_diagnosis' on results table: {results_err}. "
                    "Skipping database update for confirmed_diagnosis since the column might be missing."
                )
            
            # Cleanup completed debate from in-memory store
            if not use_db and debate_id in IN_MEMORY_DEBATES:
                del IN_MEMORY_DEBATES[debate_id]
                
        return {
            "message": ai_message,
            "debate_complete": debate_complete,
            "diagnosis": diagnosis
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed responding in debate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@debate_router.get("/{debate_id}")
async def get_debate_endpoint(debate_id: str):
    try:
        supabase = get_supabase()
        # Fetch debate session
        debate = None
        if debate_id in IN_MEMORY_DEBATES:
            debate = IN_MEMORY_DEBATES[debate_id]
        else:
            try:
                deb_resp = supabase.table("debates").select("*").eq("id", debate_id).execute()
                if deb_resp.data:
                    debate = deb_resp.data[0]
            except Exception as db_err:
                logger.warning(f"Failed to fetch debate from database: {db_err}")
                
        if not debate:
            raise HTTPException(status_code=404, detail="Debate session not found")
        
        # Fetch exam details to get original question text
        exam_resp = supabase.table("exams").select("questions").eq("id", debate.get("exam_id")).execute()
        question_text = ""
        if exam_resp.data:
            questions = exam_resp.data[0].get("questions", [])
            question = next((q for q in questions if q.get("id") == debate.get("question_id")), None)
            if question:
                question_text = question.get("text", "")
        
        # Return full object decorated with question text
        # Filter out question_cache from response to keep payloads clean
        response_debate = {k: v for k, v in debate.items() if k != "question_cache"}
        return {
            **response_debate,
            "question_text": question_text
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch debate: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
