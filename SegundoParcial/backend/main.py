from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from pymongo import MongoClient
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError
import os
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- CONFIGURACIÓN ---
load_dotenv()
app = FastAPI(title="ReViews Examen")

# CLIENT ID
GOOGLE_CLIENT_ID = "1056114087976-l4huskim3dpijrms6j8brmqj6ha0h0rh.apps.googleusercontent.com"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CONEXIÓN BASE DE DATOS
client = MongoClient(os.getenv("MONGO_URI"))
db_name = os.getenv("MONGO_DB", "segundo_parcial")
db = client[db_name]

users_col = db["usuarios"]
resenas_col = db["resenas"]

SECRET_KEY = os.getenv("SECRET_KEY", "secret")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# --- AUTH UTILS ---
def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def get_password_hash(password): return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + timedelta(minutes=60)
    # AÑADIMOS 'iat' (Issued At) PARA CUMPLIR EL REQUISITO
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- CREACIÓN USUARIO AUTOMÁTICO ---
try:
    if not users_col.find_one({"email": "pepe@test.com"}):
        users_col.insert_one({
            "email": "pepe@test.com", 
            "password": get_password_hash("1234")
        })
        print("✅ Usuario pepe@test.com creado")
except Exception: pass

# --- MODELOS ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class GoogleLogin(BaseModel):
    token: str

class ResenaCreate(BaseModel):
    nombre_establecimiento: str
    direccion: str
    latitud: float
    longitud: float
    valoracion: int 
    imagen_url: Optional[str] = None

class ResenaOut(ResenaCreate):
    id: str
    autor_email: str
    token_usado: str
    # Hacemos este campo opcional con Optional[...] y valor por defecto None
    token_emision: Optional[str] = "N/A" 
    token_expira: str
    fecha_creacion: str

# --- ENDPOINTS AUTH ---
@app.post("/register")
def register(user: UserCreate):
    if users_col.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email ya existe")
    users_col.insert_one({"email": user.email, "password": get_password_hash(user.password)})
    return {"msg": "Ok"}

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_col.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400)
    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}

@app.post("/google-login")
def google_login(item: GoogleLogin):
    try:
        idinfo = id_token.verify_oauth2_token(item.token, google_requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        user = users_col.find_one({"email": email})
        if not user:
            dummy = get_password_hash("google_" + os.urandom(10).hex())
            users_col.insert_one({"email": email, "password": dummy})
        token = create_access_token(data={"sub": email})
        return {"access_token": token, "token_type": "bearer"}
    except ValueError:
        raise HTTPException(status_code=401, detail="Token inválido")

# --- ENDPOINTS RESEÑAS ---
@app.post("/resenas")
def crear_resena(r: ResenaCreate, token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        exp_ts = payload.get("exp") 
        iat_ts = payload.get("iat") # <--- CAPTURAMOS FECHA EMISIÓN
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    nueva_resena = r.dict()
    
    # Formateamos las fechas
    f_exp = datetime.fromtimestamp(exp_ts).strftime('%Y-%m-%d %H:%M:%S')
    f_iat = datetime.fromtimestamp(iat_ts).strftime('%Y-%m-%d %H:%M:%S') if iat_ts else "N/A"

    nueva_resena.update({
        "autor_email": email,
        "token_usado": token,
        "token_emision": f_iat, # <--- GUARDAMOS FECHA EMISIÓN
        "token_expira": f_exp,
        "fecha_creacion": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })
    
    resenas_col.insert_one(nueva_resena)
    return {"msg": "Reseña creada"}

@app.get("/resenas", response_model=List[ResenaOut])
def listar_resenas():
    resenas = []
    for doc in resenas_col.find():
        doc["id"] = str(doc["_id"])
        resenas.append(doc)
    return resenas