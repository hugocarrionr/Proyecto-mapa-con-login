from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from pymongo import MongoClient
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError
import os
from dotenv import load_dotenv
# --- IMPORTS GOOGLE ---
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# 1. CONFIGURACIÓN
load_dotenv()
app = FastAPI(title="Backend Lite Examen")

# TU CLIENT ID DE GOOGLE
GOOGLE_CLIENT_ID = "1056114087976-l4huskim3dpijrms6j8brmqj6ha0h0rh.apps.googleusercontent.com"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient(os.getenv("MONGO_URI"))
# Usamos la variable de entorno o 'test_db' por defecto
db_name = os.getenv("MONGO_DB", "test_db")
db = client[db_name]
users_collection = db["usuarios"]
lugares_collection = db["lugares"]

SECRET_KEY = os.getenv("SECRET_KEY", "secret")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# 2. MODELOS
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class LugarBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    latitud: float = 0.0
    longitud: float = 0.0

class LugarCreate(LugarBase):
    pass

class LugarOut(LugarBase):
    id: str
    owner: str

# Modelo para recibir el token de Google
class GoogleLogin(BaseModel):
    token: str

# 3. SEGURIDAD
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise exception
    except JWTError:
        raise exception
    return email

# 4. RUTAS
@app.post("/register")
def register(user: UserCreate):
    if users_collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email ya registrado")
    hashed_pass = get_password_hash(user.password)
    users_collection.insert_one({"email": user.email, "password": hashed_pass})
    return {"message": "Usuario creado"}

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Datos incorrectos")
    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}

# --- RUTA NUEVA: LOGIN CON GOOGLE ---
@app.post("/google-login")
def google_login(item: GoogleLogin):
    try:
        # 1. Verificar el token con Google
        idinfo = id_token.verify_oauth2_token(
            item.token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )

        # 2. Obtener email
        email = idinfo['email']
        
        # 3. Buscar si existe en BD, si no, crear al vuelo
        user = users_collection.find_one({"email": email})
        
        if not user:
            # Crear usuario con contraseña dummy (nunca se usará para login normal)
            dummy_password = get_password_hash("google_auth_" + os.urandom(10).hex())
            users_collection.insert_one({"email": email, "password": dummy_password})
        
        # 4. Generar NUESTRO token JWT
        access_token = create_access_token(data={"sub": email})
        return {"access_token": access_token, "token_type": "bearer"}

    except ValueError:
        raise HTTPException(status_code=401, detail="Token de Google inválido")

# --- RUTAS LUGARES ---
@app.get("/lugares", response_model=List[LugarOut])
def get_lugares():
    lugares = []
    for doc in lugares_collection.find():
        lugares.append({
            "id": str(doc["_id"]),
            "nombre": doc["nombre"],
            "descripcion": doc.get("descripcion"),
            "imagen_url": doc.get("imagen_url"),
            "latitud": doc.get("latitud"),
            "longitud": doc.get("longitud"),
            "owner": doc.get("owner")
        })
    return lugares

@app.post("/lugares", response_model=LugarOut)
def create_lugar(lugar: LugarCreate, current_user: str = Depends(get_current_user)):
    new_lugar = lugar.dict()
    new_lugar["owner"] = current_user
    result = lugares_collection.insert_one(new_lugar)
    return {"id": str(result.inserted_id), **new_lugar}