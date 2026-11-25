from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.security import (
    authenticate_admin,
    clear_session_cookie,
    get_current_admin,
    get_session,
    require_csrf,
    set_session_cookie,
)
from app.schemas.auth import LoginRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(credentials: LoginRequest, request: Request, response: Response):
    if not request.client:
        raise HTTPException(status_code=400, detail="Unable to identify client")
    admin_id = authenticate_admin(
        credentials.username,
        credentials.password,
        request.client.host,
    )
    csrf_token = set_session_cookie(response, admin_id)
    return {"authenticated": True, "csrf_token": csrf_token}


@router.get("/me")
def current_session(admin: dict = Depends(get_current_admin)):
    return {
        "authenticated": True,
        "username": admin["username"],
        "csrf_token": admin["csrf_token"],
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    session = get_session(request)
    require_csrf(request, session)
    clear_session_cookie(response)
    return {"authenticated": False}
