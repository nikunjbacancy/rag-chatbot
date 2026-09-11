from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str
    gemini_model: str = "gemini-1.5-flash"
    embedding_model: str = "all-MiniLM-L6-v2"
    chroma_persist_dir: str = "./chroma_db"
    uploads_dir: str = "./uploads"
    max_file_size_mb: int = 50
    chunk_size: int = 512
    chunk_overlap: int = 50
    top_k_results: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
