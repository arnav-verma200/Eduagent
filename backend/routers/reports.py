import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from backend.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exams", tags=["reports"])

@router.get("/{exam_id}/report")
async def get_class_report(exam_id: str):
    """
    Returns class-wide diagnostic report for a specific exam.
    Computes top concept gaps, error type distribution, and compiles integrity flags.
    """
    try:
        supabase = get_supabase()
        
        # Fetch the exam details
        exam_resp = supabase.table("exams").select("*").eq("id", exam_id).execute()
        if not exam_resp.data:
            raise HTTPException(status_code=404, detail="Exam not found.")
        exam = exam_resp.data[0]
        
        # Fetch all results for this exam
        res_resp = supabase.table("results").select("*").eq("exam_id", exam_id).execute()
        results = res_resp.data or []
        
        if not results:
            return {
                "exam_id": exam_id,
                "topic": exam.get("topic", "Exam"),
                "average_score": 0,
                "total_submissions": 0,
                "error_type_distribution": {},
                "top_concept_gaps": [],
                "integrity_flags": [],
                "student_results": []
            }
            
        total_score_pct = 0
        total_submissions = len(results)
        
        # Initialize diagnostics aggregators
        error_distribution = {
            "CORRECT": 0,
            "CONCEPTUAL_GAP": 0,
            "PROCEDURAL_ERROR": 0,
            "BLIND_SPOT": 0,
            "MISCALIBRATION": 0,
            "PARTIAL": 0
        }
        
        concept_gaps_count = {}
        all_integrity_flags = []
        student_results_list = []
        
        for r in results:
            student_id = r.get("student_id")
            created_at = r.get("created_at")
            gap_depth = r.get("gap_depth") or "unprobed"
            
            # 1. Parse Evaluator diagnostics
            eval_data = r.get("evaluation") or {}
            cog_profile = eval_data.get("cognitive_profile") or {}
            score = cog_profile.get("score", 0)
            max_score = cog_profile.get("max_score", 10)
            
            percentage = (score / max_score) * 100 if max_score > 0 else 0
            total_score_pct += percentage
            
            evaluations_list = eval_data.get("evaluations") or []
            for ev in evaluations_list:
                err_type = ev.get("error_type")
                if err_type in error_distribution:
                    error_distribution[err_type] += 1
                
                # Check for concept gaps
                gap = ev.get("concept_gap")
                if gap and ev.get("is_correct") is False:
                    concept_gaps_count[gap] = concept_gaps_count.get(gap, 0) + 1
                    
            # 2. Parse Integrity diagnostics
            integ_data = r.get("integrity") or {}
            integrity_score = integ_data.get("integrity_score", 100)
            flags = integ_data.get("flags") or []
            
            for flag in flags:
                all_integrity_flags.append({
                    "student_id": student_id,
                    "type": flag.get("type"),
                    "question_id": flag.get("question_id"),
                    "evidence": flag.get("evidence"),
                    "severity": flag.get("severity", "low")
                })
                
            # 3. Add to student table
            student_results_list.append({
                "student_id": student_id,
                "score": score,
                "max_score": max_score,
                "dominant_error_type": cog_profile.get("dominant_error_type", "NONE"),
                "integrity_score": integrity_score,
                "gap_depth": gap_depth,
                "submitted_at": created_at
            })
            
        # Calculate summary metrics
        average_score = round(total_score_pct / total_submissions, 1)
        
        # Sort and clean top concept gaps
        sorted_gaps = [
            {"concept": k, "count": v}
            for k, v in sorted(concept_gaps_count.items(), key=lambda item: item[1], reverse=True)
        ]
        
        return {
            "exam_id": exam_id,
            "topic": exam.get("topic", "Exam"),
            "average_score": average_score,
            "total_submissions": total_submissions,
            "error_type_distribution": error_distribution,
            "top_concept_gaps": sorted_gaps[:10],  # Top 10 gaps
            "integrity_flags": all_integrity_flags,
            "student_results": student_results_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate class report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
