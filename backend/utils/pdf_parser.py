import fitz  # PyMuPDF
import logging

logger = logging.getLogger(__name__)

# Limits to prevent sending enormous prompts to Gemini (PERF-3 fix)
MAX_PAGES = 30
MAX_CHARACTERS = 50_000


def parse_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Parses PDF bytes and extracts text.
    Caps extraction at MAX_PAGES pages or MAX_CHARACTERS characters to keep
    Gemini prompts within reasonable size and avoid slow generation times.
    """
    try:
        # Open PDF from bytes stream
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_content = []
        total_chars = 0
        pages_to_parse = min(len(doc), MAX_PAGES)
        
        for page_num in range(pages_to_parse):
            page = doc.load_page(page_num)
            page_text = page.get_text()
            text_content.append(page_text)
            total_chars += len(page_text)
            
            if total_chars >= MAX_CHARACTERS:
                logger.info(
                    f"PDF text extraction capped at {total_chars} characters "
                    f"(page {page_num + 1}/{len(doc)}). "
                    f"Remaining pages skipped to keep prompt size manageable."
                )
                break
        
        if len(doc) > MAX_PAGES:
            logger.info(
                f"PDF has {len(doc)} pages but only the first {MAX_PAGES} were parsed."
            )
            
        doc.close()
        result = "\n".join(text_content).strip()
        
        # Final character cap (in case individual pages are huge)
        if len(result) > MAX_CHARACTERS:
            result = result[:MAX_CHARACTERS]
            
        return result
    except Exception as e:
        logger.error(f"Failed to parse PDF bytes: {e}")
        raise ValueError(f"Error reading PDF content: {str(e)}")
