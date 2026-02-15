from pydantic import BaseModel

class SignupRequest(BaseModel):
    name: str
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username_or_email: str
    password: str
