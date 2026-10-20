from database import db
from datetime import datetime, timezone

def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Usuario(db.Model):
    __tablename__ = 'usuarios'
    id = db.Column(db.Integer, primary_key=True)
    nombre_restaurante = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)  # Para la URL pública (ej. cartora.com/m/mi-restaurante)
    created_at = db.Column(db.DateTime, default=_utcnow)
    menus = db.relationship('Menu', backref='usuario', lazy=True)

class Menu(db.Model):
    __tablename__ = 'menus'
    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(100), default='Menú Principal')
    contenido_json = db.Column(db.Text, nullable=False)  # Guarda el estado del lienzo de Fabric.js
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)