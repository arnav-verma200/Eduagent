import os
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

# Use module-level logger only — don't reconfigure root logger (QUALITY-2 fix)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Lazy-initialized singleton (BUG-6 fix)
# The client is created on first use rather than at import time, so transient
# network failures during startup don't permanently disable database access.
_supabase: Client | None = None
_init_attempted: bool = False


def get_supabase() -> Client:
    """
    Lazy-initializes and returns the Supabase client singleton.
    Retries initialization if a previous attempt failed, allowing recovery
    from transient network issues without restarting the server.
    """
    global _supabase, _init_attempted

    if _supabase is not None:
        return _supabase

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError(
            "Supabase client cannot be initialized: SUPABASE_URL or SUPABASE_KEY "
            "environment variable is missing. Please check your .env file."
        )

    try:
        _supabase = create_client(supabase_url, supabase_key)
        if not _init_attempted:
            logger.info("Supabase client initialized successfully.")
        else:
            logger.info("Supabase client initialized successfully on retry.")
        _init_attempted = True
        return _supabase
    except Exception as e:
        _init_attempted = True
        logger.error(f"Failed to initialize Supabase client: {e}")
        raise ValueError(f"Failed to initialize Supabase client: {e}")
