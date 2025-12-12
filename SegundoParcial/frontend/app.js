// --- CONFIGURACIÓN URL ---
// 1. Descomenta esta para PROBAR EN LOCAL:
//const API_URL = "http://localhost:8000"; 

// 2. Descomenta esta para PRODUCCIÓN (NUBE):
 const API_URL = "https://proyecto-mapa-con-login.onrender.com"; 


// --- CONFIGURACIÓN CLOUDINARY ---
const CLOUD_NAME = "dly4a0pgx"; 
const CLOUDINARY_PRESET = "examen_preset"; 
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

let map, marker;

// --- GOOGLE LOGIN (NUEVO) ---
async function handleCredentialResponse(response) {
    console.log("Google Token recibido...");
    try {
        const res = await fetch(`${API_URL}/google-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: response.credential })
        });

        if (!res.ok) throw new Error("Fallo en el backend con Google");

        const data = await res.json();
        
        // Guardamos token y redirigimos
        localStorage.setItem('token', data.access_token);
        window.location.href = 'index.html';

    } catch (error) {
        console.error("Error:", error);
        alert("Error al iniciar sesión con Google");
    }
}

// --- AUTH ---
function checkAuth() {
    if (!localStorage.getItem('token')) window.location.href = 'login.html';
}
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: 'OSM'}).addTo(map);
    
    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        document.getElementById('lat').value = lat.toFixed(6);
        document.getElementById('lng').value = lng.toFixed(6);
        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);
    });
}

// --- CLOUDINARY ---
async function subirImagen(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    try {
        const res = await fetch(CLOUDINARY_URL, {method: 'POST', body: formData});
        const data = await res.json();
        return data.secure_url;
    } catch (e) { console.error(e); return null; }
}

// --- CRUD ---
async function crearLugar() {
    const nombre = document.getElementById('nombre').value;
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;
    const fileInput = document.getElementById('imagen');
    const token = localStorage.getItem('token');

    if (!nombre || !lat) return alert("Faltan datos");

    let imagenUrl = "";
    if (fileInput.files.length > 0) {
        document.querySelector('button').innerText = "Subiendo...";
        imagenUrl = await subirImagen(fileInput.files[0]);
        document.querySelector('button').innerText = "Guardar Lugar";
    }

    const datos = {
        nombre: nombre,
        descripcion: document.getElementById('descripcion').value,
        latitud: parseFloat(lat),
        longitud: parseFloat(lng),
        imagen_url: imagenUrl
    };

    const res = await fetch(`${API_URL}/lugares`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
        body: JSON.stringify(datos)
    });

    if (res.ok) {
        alert("Guardado!");
        location.reload();
    } else {
        alert("Error al guardar");
    }
}

async function cargarLugares() {
    if (!document.getElementById('lista-lugares')) return;
    const res = await fetch(`${API_URL}/lugares`);
    const lugares = await res.json();
    const div = document.getElementById('lista-lugares');
    div.innerHTML = "<h3>Lugares</h3>";
    
    lugares.forEach(l => {
        const imgHtml = l.imagen_url ? `<img src="${l.imagen_url}" style="max-width:200px; display:block; margin-top:5px;">` : '';
        div.innerHTML += `<div style="border-bottom:1px solid #ccc; padding:10px;"><b>${l.nombre}</b><br>${l.descripcion}<br>${imgHtml}</div>`;
        const popup = `<b>${l.nombre}</b><br>${imgHtml}`;
        L.marker([l.latitud, l.longitud]).addTo(map).bindPopup(popup);
    });
}