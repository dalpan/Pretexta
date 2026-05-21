from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import Challenge, Quiz, User
from services.auth import get_current_user
from services.database import db

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/yaml")
async def import_yaml_file(
    file_content: dict[str, Any], current_user: User = Depends(get_current_user)
):
    """Import YAML challenge or quiz."""
    try:
        yaml_type = file_content.get("type")
        data = file_content.get("data")

        if yaml_type == "challenge":
            challenge = Challenge(**data)
            doc = challenge.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.challenges.insert_one(doc)
            return {"message": "Challenge imported", "id": challenge.id}

        elif yaml_type == "quiz":
            quiz = Quiz(**data)
            doc = quiz.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.quizzes.insert_one(doc)
            return {"message": "Quiz imported", "id": quiz.id}

        else:
            raise HTTPException(status_code=400, detail="Unknown YAML type")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")
