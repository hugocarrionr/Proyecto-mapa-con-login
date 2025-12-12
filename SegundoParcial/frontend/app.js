// --- CONFIGURACIÓN ---
// 1. LOCAL:
//const API_URL = "http://localhost:8000"; 
// 2. NUBE:
 const API_URL = "https://proyecto-mapa-con-login.onrender.com"; 

const CLOUD_NAME = "dly4a0pgx"; 
const CLOUDINARY_PRESET = "examen_preset"; 
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

let map;

// --- AUTH ---
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

async function handleCredentialResponse(response) {
    console.log("Token Google recibido...");
    try {
        const res = await fetch(`${API_URL}/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        if (!res.ok) throw new Error("Fallo en validación Google");
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        window.location.href = 'index.html';
    } catch (error) {
        console.error(error);
        alert("Error al entrar con Google");
    }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('errorMsg');
        
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        try {
            const res = await fetch(`${API_URL}/token`, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: formData
            });
            if (!res.ok) throw new Error('Error');
            const data = await res.json();
            localStorage.setItem('token', data.access_token);
            window.location.href = 'index.html';
        } catch (err) {
            if(errorMsg) { errorMsg.style.display = 'block'; errorMsg.innerText = "Error login"; }
        }
    });
}

// --- MAPA ---
function initMap() {
    if (!document.getElementById('map')) return;
    map = L.map('map').setView([36.7213, -4.4214], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

// --- GEOCODING ---
async function geocodificar() {
    const dir = document.getElementById('direccion').value;
    if(!dir) return alert("Escribe una dirección");

    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${dir}`);
    const data = await res.json();

    if(data.length > 0) {
        const lat = data[0].lat;
        const lng = data[0].lon;
        document.getElementById('lat').value = lat;
        document.getElementById('lng').value = lng;
        map.setView([lat, lng], 16);
        L.marker([lat, lng]).addTo(map).bindPopup("Ubicación seleccionada").openPopup();
    } else {
        alert("Dirección no encontrada");
    }
}

async function centrarMapa() {
    const dir = document.getElementById('buscarMapa').value;
    if(!dir) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${dir}`);
    const data = await res.json();
    if(data.length > 0) {
        map.setView([data[0].lat, data[0].lon], 15);
        L.marker([data[0].lat, data[0].lon]).addTo(map).bindPopup(dir).openPopup();
    }
}

// --- CLOUDINARY ---
async function subirImagen(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    try {
        const res = await fetch(CLOUDINARY_URL, {method:'POST', body:fd});
        return (await res.json()).secure_url;
    } catch(e) { return null; }
}

// --- CRUD RESEÑAS ---
async function guardarResena() {
    const nombre = document.getElementById('nombre').value;
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;
    const val = document.getElementById('valoracion').value;
    const file = document.getElementById('imagen').files[0];

    if(!nombre || !lat) return alert("Faltan datos (haz clic en Buscar Coordenadas)");

    let imgUrl = "";
    if(file) {
        document.querySelector('button[onclick="guardarResena()"]').innerText = "Subiendo...";
        imgUrl = await subirImagen(file);
    }

    const datos = {
        nombre_establecimiento: nombre,
        direccion: document.getElementById('direccion').value,
        latitud: parseFloat(lat),
        longitud: parseFloat(lng),
        valoracion: parseInt(val),
        imagen_url: imgUrl
    };

    const res = await fetch(`${API_URL}/resenas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(datos)
    });

    if(res.ok) {
        alert("Reseña guardada!");
        location.reload();
    } else {
        alert("Error al guardar");
    }
}

async function cargarResenas() {
    if (!document.getElementById('lista-resenas')) return;
    const res = await fetch(`${API_URL}/resenas`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
    });
    const lista = await res.json();
    const div = document.getElementById('lista-resenas');
    div.innerHTML = "";

    lista.forEach(r => {
        const imgHtml = r.imagen_url ? `<img src="${r.imagen_url}" style="width:100px; display:block; margin:5px 0;">` : '';
        
        // --- DETALLES TÉCNICOS ---
        const detallesTecnicos = `
            <details style="margin-top:5px; font-size:0.8em; color:gray;">
                <summary>Ver detalles técnicos (Token)</summary>
                <p><b>Autor:</b> ${r.autor_email}</p>
                <p><b>Emitido:</b> ${r.token_emision}</p> <p><b>Caduca:</b> ${r.token_expira}</p>
                <p style="word-break:break-all;"><b>Token RAW:</b> ${r.token_usado}</p>
            </details>
        `;

        div.innerHTML += `
            <div class="card" style="border:1px solid #ccc; margin-bottom:10px; padding:10px;">
                <h4>${r.nombre_establecimiento} (${r.valoracion} ⭐)</h4>
                <p>📍 ${r.direccion}</p>
                ${imgHtml}
                ${detallesTecnicos}
            </div>
        `;

        if(map) {
            L.marker([r.latitud, r.longitud]).addTo(map)
                .bindPopup(`<b>${r.nombre_establecimiento}</b><br>${r.valoracion} estrellas`);
        }
    });
}