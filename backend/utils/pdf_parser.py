import fitz  # PyMuPDF
import logging

logger = logging.getLogger(__name__)

def parse_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Parses PDF bytes and extracts text.
    """
    try:
        # Open PDF from bytes stream
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_content = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text_content.append(page.get_text())
            
        doc.close()
        return "\n".join(text_content).strip()
    except Exception as e:
        logger.error(f"Failed to parse PDF bytes: {e}")
        raise ValueError(f"Error reading PDF content: {str(e)}")
