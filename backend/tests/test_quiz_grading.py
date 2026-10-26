"""Server-side quiz grading: no leaked answer key, no client-set score."""

import uuid

from services.database import db
from tests.conftest import make_user

QUIZ = {
    "id": "quiz-1",
    "title": "Phishing Basics",
    "difficulty": "easy",
    "cialdini_categories": ["authority"],
    "questions": [
        {
            "id": "q1",
            "content_en": {
                "text": "Which is phishing?",
                "explanation": "Urgent reset links are classic.",
            },
            "options": [
                {"text": "Urgent reset link", "correct": True},
                {"text": "Calendar invite", "correct": False},
            ],
            "points": 10,
        },
        {
            "id": "q2",
            "content_en": {"text": "Red flag?", "explanation": "Look-alike domains."},
            "options": [
                {"text": "Normal domain", "correct": False},
                {"text": "Look-alike domain", "correct": True},
            ],
            "points": 10,
        },
    ],
}


async def _seed_quiz():
    await db.quizzes.insert_one(dict(QUIZ))


async def test_get_quiz_hides_answer_key(api):
    _, h = await make_user("user")
    await _seed_quiz()
    quiz = (await api.get("/api/quizzes/quiz-1", headers=h)).json()
    for q in quiz["questions"]:
        for opt in q["options"]:
            assert "correct" not in opt
        assert "explanation" not in q["content_en"]


async def test_submit_grades_server_side(api):
    _, h = await make_user("user")
    await _seed_quiz()
    # q1 correct (index 0), q2 wrong (index 0 instead of 1)
    r = await api.post(
        "/api/quizzes/quiz-1/submit", json={"answers": {"q1": 0, "q2": 0}}, headers=h
    )
    body = r.json()
    assert body["score"] == 50
    assert body["correct_count"] == 1
    assert body["results"][0]["is_correct"] is True
    assert body["results"][1]["correct_index"] == 1
    assert body["results"][1]["explanation"]  # key revealed only after submit
    sim = await db.simulations.find_one({"id": body["simulation_id"]})
    assert sim["score"] == 50 and sim["simulation_type"] == "quiz"


async def test_perfect_score(api):
    _, h = await make_user("user")
    await _seed_quiz()
    r = await api.post(
        "/api/quizzes/quiz-1/submit", json={"answers": {"q1": 0, "q2": 1}}, headers=h
    )
    assert r.json()["score"] == 100


async def test_unanswered_counts_wrong(api):
    _, h = await make_user("user")
    await _seed_quiz()
    r = await api.post("/api/quizzes/quiz-1/submit", json={"answers": {}}, headers=h)
    assert r.json()["score"] == 0


async def test_client_cannot_post_quiz_simulation(api):
    _, h = await make_user("user")
    r = await api.post(
        "/api/simulations",
        json={"simulation_type": "quiz", "status": "completed", "score": 100},
        headers=h,
    )
    assert r.status_code == 409


async def test_points_weighting(api):
    _, h = await make_user("user")
    quiz = {**QUIZ, "id": "quiz-2"}
    quiz["questions"] = [
        {**QUIZ["questions"][0], "points": 30},  # correct
        {**QUIZ["questions"][1], "points": 10},  # wrong
    ]
    quiz["questions"][0] = dict(quiz["questions"][0])
    await db.quizzes.insert_one(dict(quiz))
    r = await api.post(
        "/api/quizzes/quiz-2/submit", json={"answers": {"q1": 0, "q2": 0}}, headers=h
    )
    assert r.json()["score"] == 75  # 30 of 40 points


async def test_submit_missing_quiz(api):
    _, h = await make_user("user")
    r = await api.post(f"/api/quizzes/{uuid.uuid4()}/submit", json={"answers": {}}, headers=h)
    assert r.status_code == 404
