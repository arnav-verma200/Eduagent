from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class QuestionSubmission(BaseModel):
    question_id: str = Field(..., description="ID of the question from the exam")
    answer: str = Field(..., description="Student's answer text or selected option")
    scratchpad: Optional[str] = Field("No scratchpad provided", description="Thinking notes from the scratchpad")
    confidence: int = Field(..., ge=1, le=5, description="Confidence rating, 1 to 5")
    time_spent: int = Field(..., description="Time spent on the question in seconds")
    copy_paste_detected: Optional[bool] = False
    tab_change_detected: Optional[bool] = False

class ExamSubmissionRequest(BaseModel):
    student_id: str = Field(..., description="ID of the student taking the exam")
    responses: List[QuestionSubmission]

class ProbeAnswerSubmission(BaseModel):
    question_id: str = Field(..., description="ID of the probe question")
    answer: str = Field(..., description="Student's answer to the probe question")

class ProbeSubmissionRequest(BaseModel):
    student_id: str = Field(..., description="ID of the student")
    responses: List[ProbeAnswerSubmission]
