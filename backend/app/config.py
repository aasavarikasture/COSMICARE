"""COSMICARE backend configuration.

All secrets and provider settings are read server-side from environment
variables. Nothing here is ever sent to the browser.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    app_name: str = "COSMICARE"
    environment: str = "development"
    debug: bool = True

    database_url: str = f"sqlite:///{(BASE_DIR / 'cosmicare_rebuild.db').resolve().as_posix()}"

    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 720

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"

    # LLM provider abstraction (server-side only)
    llm_provider: str = "mock"          # mock | openai | openai_compatible
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 25.0
    llm_mock: bool = True

    # Space weather (optional, read-only public API)
    # NOTE: only used for observed geomagnetic context, never for astronaut dose.
    space_weather_enabled: bool = True
    space_weather_url: str = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
    space_weather_timeout: float = 6.0

    # Demo behaviour
    auto_seed: bool = True
    sim_seed: int = 2026
    # Non-clinical invite code required to self-register privileged roles in the demo.
    demo_invite_code: str = "COSMICARE-DEMO-2026"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
