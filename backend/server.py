from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import yaml
import re
from io import BytesIO
import json

# ROOT_DIR = Path(__file__).parent
load_dotenv()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Soceng Lab API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'soceng-lab-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: Dict[str, Any]

class Challenge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    difficulty: str  # easy, medium, hard
    cialdini_categories: List[str]
    estimated_time: int  # minutes
    nodes: List[Dict[str, Any]]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    content_en: Optional[Dict[str, Any]] = None
    content_id: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Quiz(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    difficulty: str
    cialdini_categories: List[str]
    questions: List[Dict[str, Any]]
    content_en: Optional[Dict[str, Any]] = None
    content_id: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Simulation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    challenge_id: Optional[str] = None
    quiz_id: Optional[str] = None
    simulation_type: str  # challenge, quiz, ai_challenge
    status: str  # running, completed, paused
    events: List[Dict[str, Any]] = Field(default_factory=list)
    score: Optional[float] = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    participant_name: Optional[str] = None
    
    # AI Challenge specific fields
    type: Optional[str] = None  # For backwards compatibility, same as simulation_type
    challenge_type: Optional[str] = None  # comprehensive, email_analysis, interactive, scenario
    category: Optional[str] = None  # phishing, pretexting, baiting, etc.
    difficulty: Optional[str] = None  # beginner, intermediate, advanced
    total_questions: Optional[int] = None
    correct_answers: Optional[int] = None
    answers: Optional[Dict[str, Any]] = None
    challenge_data: Optional[Dict[str, Any]] = None

class LLMConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: str  # openai, gemini, claude, generic
    api_key: str  # encrypted
    model_name: Optional[str] = None
    enabled: bool = False
    rate_limit: int = 100  # per hour
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "settings"
    language: str = "en"
    theme: str = "dark"
    first_run_completed: bool = False
    llm_enabled: bool = False
    reduce_motion: bool = False

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def create_token(user_id: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "user_id": user_id,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Soceng Lab API", "version": "1.0.0"}

# Auth Routes
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    user_doc = await db.users.find_one({"username": request.username}, {"_id": 0})
    
    if not user_doc or not verify_password(request.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = User(**user_doc)
    token = create_token(user.id)
    
    return LoginResponse(
        token=token,
        user={
            "id": user.id,
            "username": user.username,
            "created_at": user.created_at.isoformat()
        }
    )

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "created_at": current_user.created_at.isoformat()
    }

# Challenge Routes
@api_router.get("/challenges", response_model=List[Challenge])
async def get_challenges(current_user: User = Depends(get_current_user)):
    challenges = await db.challenges.find({}, {"_id": 0}).to_list(1000)
    return challenges

@api_router.get("/challenges/{challenge_id}", response_model=Challenge)
async def get_challenge(challenge_id: str, current_user: User = Depends(get_current_user)):
    challenge = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return challenge

@api_router.post("/challenges", response_model=Challenge)
async def create_challenge(challenge: Challenge, current_user: User = Depends(get_current_user)):
    doc = challenge.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.challenges.insert_one(doc)
    return challenge

# Quiz Routes
@api_router.get("/quizzes", response_model=List[Quiz])
async def get_quizzes(current_user: User = Depends(get_current_user)):
    quizzes = await db.quizzes.find({}, {"_id": 0}).to_list(1000)
    return quizzes

@api_router.get("/quizzes/{quiz_id}", response_model=Quiz)
async def get_quiz(quiz_id: str, current_user: User = Depends(get_current_user)):
    quiz = await db.quizzes.find_one({"id": quiz_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

# Simulation Routes
@api_router.post("/simulations")
async def create_simulation(simulation: Simulation, current_user: User = Depends(get_current_user)):
    doc = simulation.model_dump()
    doc['started_at'] = doc['started_at'].isoformat()
    if doc.get('completed_at'):
        doc['completed_at'] = doc['completed_at'].isoformat()
    await db.simulations.insert_one(doc)
    return {"id": simulation.id, "status": "created"}

@api_router.get("/simulations", response_model=List[Simulation])
async def get_simulations(current_user: User = Depends(get_current_user)):
    sims = await db.simulations.find({}, {"_id": 0}).sort("started_at", -1).to_list(100)
    return sims

@api_router.get("/simulations/{simulation_id}", response_model=Simulation)
async def get_simulation(simulation_id: str, current_user: User = Depends(get_current_user)):
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return sim

@api_router.put("/simulations/{simulation_id}")
async def update_simulation(simulation_id: str, updates: Dict[str, Any], current_user: User = Depends(get_current_user)):
    if updates.get('completed_at'):
        updates['completed_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.simulations.update_one(
        {"id": simulation_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    return {"message": "Simulation updated"}

@api_router.delete("/simulations/{simulation_id}")
async def delete_simulation(simulation_id: str, current_user: User = Depends(get_current_user)):
    result = await db.simulations.delete_one({"id": simulation_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    return {"message": "Simulation deleted successfully"}

# LLM Config Routes
@api_router.get("/llm/config")
async def get_llm_configs(current_user: User = Depends(get_current_user)):
    configs = await db.llm_configs.find({}, {"_id": 0}).to_list(100)
    # Filter and mask configs
    active_configs = []
    for config in configs:
        # Skip configs with empty or no API key
        if not config.get('api_key') or config.get('api_key') == '':
            continue
        # Mask actual API keys from response (security)
        config['api_key'] = '***'
        config['updated_at'] = config.get('updated_at', datetime.now(timezone.utc).isoformat())
        active_configs.append(config)
    return active_configs

@api_router.post("/llm/config")
async def save_llm_config(config: LLMConfig, current_user: User = Depends(get_current_user)):
    doc = config.model_dump()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    # If API key is empty, delete the config (revoke)
    if not config.api_key or config.api_key == '':
        await db.llm_configs.delete_one({"provider": config.provider})
        return {"message": "LLM config deleted"}
    
    # Update or insert
    await db.llm_configs.update_one(
        {"provider": config.provider},
        {"$set": doc},
        upsert=True
    )
    
    return {"message": "LLM config saved"}

@api_router.post("/llm/generate")
async def generate_pretext(request: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Generate pretext using LLM"""
    requested_provider = request.get('provider', None)
    prompt = request.get('prompt', '')
    context = request.get('context', {})
    
    # Get LLM config - use requested provider or first enabled one
    if requested_provider:
        config = await db.llm_configs.find_one({"provider": requested_provider, "enabled": True}, {"_id": 0})
    else:
        config = await db.llm_configs.find_one({"enabled": True}, {"_id": 0})
    
    if not config:
        raise HTTPException(status_code=400, detail="LLM provider not configured or not enabled. Please configure in Settings.")
    
    provider = config['provider']
    
    # Import langchain chat models
    from langchain_openai import ChatOpenAI
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage, SystemMessage
    
    # Set model based on provider
    model_map = {
        "openai": "gpt-4o",
        "gemini": "gemini-2.5-pro",
        "claude": "claude-sonnet-4-20250514"
    }
    
    model_name = config.get('model_name') or model_map.get(provider, "gpt-4o")
    
    # Create the appropriate chat model based on provider
    try:
        if provider == "openai":
            chat_model = ChatOpenAI(
                api_key=config['api_key'],
                model=model_name,
                temperature=0.7
            )
        elif provider == "gemini":
            chat_model = ChatGoogleGenerativeAI(
                google_api_key=config['api_key'],
                model=model_name,
                temperature=0.7
            )
        elif provider == "claude":
            chat_model = ChatAnthropic(
                api_key=config['api_key'],
                model=model_name,
                temperature=0.7
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
        
        # Create messages
        # Put context to system message
        context_str = json.dumps(context, indent=2) if isinstance(context, dict) else str(context)
        system_message = SystemMessage(content="You are a social engineering pretext generator. Generate realistic, ethically-sound pretexts for security awareness training. Always mark outputs as training material.\n\nContext: " + context_str + "\n\n")
        user_message = HumanMessage(content=prompt)
        
        # Get response from LLM
        response = await chat_model.ainvoke([system_message, user_message])
        
        # Sanitize output (remove PII)
        sanitized = sanitize_llm_output(response.content)
        
        return {"generated_text": sanitized, "provider": provider}
    except Exception as e:
        logger.error(f"LLM generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {str(e)}")

def sanitize_llm_output(text: str) -> str:
    """Sanitize LLM outputs - no PII removal needed for simulation"""
    # Just clean up markdown artifacts if any
    text = text.replace('\\[TRAINING\\]', '').replace('\\[TRAINING MATERIAL\\]', '')
    return text.strip()

# Settings Routes
@api_router.get("/settings", response_model=Settings)
async def get_settings(current_user: User = Depends(get_current_user)):
    settings = await db.settings.find_one({"id": "settings"}, {"_id": 0})
    if not settings:
        settings = Settings().model_dump()
        await db.settings.insert_one(settings)
    return settings

@api_router.put("/settings")
async def update_settings(updates: Dict[str, Any], current_user: User = Depends(get_current_user)):
    await db.settings.update_one(
        {"id": "settings"},
        {"$set": updates},
        upsert=True
    )
    return {"message": "Settings updated"}

# YAML Import Route
@api_router.post("/import/yaml")
async def import_yaml_file(file_content: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Import YAML challenge or quiz"""
    try:
        yaml_type = file_content.get('type')
        data = file_content.get('data')
        
        if yaml_type == 'challenge':
            challenge = Challenge(**data)
            doc = challenge.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.challenges.insert_one(doc)
            return {"message": "Challenge imported", "id": challenge.id}
        
        elif yaml_type == 'quiz':
            quiz = Quiz(**data)
            doc = quiz.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.quizzes.insert_one(doc)
            return {"message": "Quiz imported", "id": quiz.id}
        
        else:
            raise HTTPException(status_code=400, detail="Unknown YAML type")
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

# Report Generation Route
@api_router.get("/reports/{simulation_id}/json")
async def get_report_json(simulation_id: str, current_user: User = Depends(get_current_user)):
    sim = await db.simulations.find_one({"id": simulation_id}, {"_id": 0})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    # Calculate detailed score
    score_data = calculate_susceptibility_score(sim)
    
    report = {
        "simulation_id": simulation_id,
        "score": score_data,
        "events": sim.get('events', []),
        "started_at": sim.get('started_at'),
        "completed_at": sim.get('completed_at'),
        "participant_name": sim.get('participant_name')
    }
    
    return report

def calculate_susceptibility_score(simulation: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate susceptibility score 0-100"""
    events = simulation.get('events', [])
    
    if not events:
        return {"total": 0, "breakdown": {}}
    
    # Simple scoring logic
    compliance_count = sum(1 for e in events if e.get('action') == 'complied')
    total_events = len(events)
    
    # Lower score = more susceptible
    base_score = max(0, 100 - (compliance_count / total_events * 100)) if total_events > 0 else 50
    
    return {
        "total": round(base_score, 2),
        "breakdown": {
            "compliance_rate": round((compliance_count / total_events * 100) if total_events > 0 else 0, 2),
            "total_events": total_events
        }
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db():
    """Initialize database with seed user"""
    # Check if seed user exists
    existing_user = await db.users.find_one({"username": "soceng"})
    
    if not existing_user:
        seed_user = User(
            username="soceng",
            password_hash=hash_password("Cialdini@2025!")
        )
        doc = seed_user.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.users.insert_one(doc)
        logger.info("Seed user created: soceng / Cialdini@2025!")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
