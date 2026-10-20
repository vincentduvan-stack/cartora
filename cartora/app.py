import os
import json
import secrets
import hmac
from functools import wraps

from flask import Flask, abort, jsonify, redirect, render_template, request, session, url_for
from sqlalchemy.exc import SQLAlchemyError
from database import db, init_db
from models import Usuario, Menu

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('CARTORA_SECRET_KEY') or secrets.token_hex(32)
app.config['ADMIN_PASSWORD'] = os.environ.get('CARTORA_ADMIN_PASSWORD')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('CARTORA_COOKIE_SECURE') == '1'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cartora.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Inicializa la base de datos
init_db(app)

# Crear usuario por defecto si la base de datos está vacía (para pruebas)
def crear_usuario_demo():
    with app.app_context():
        if not Usuario.query.first():
            user = Usuario(
                nombre_restaurante="Restaurante Demo",
                email="demo@cartora.com",
                slug="demo"
            )
            db.session.add(user)
            db.session.commit()

crear_usuario_demo()

def csrf_token():
    token = session.get('_csrf_token')
    if not token:
        token = secrets.token_urlsafe(32)
        session['_csrf_token'] = token
    return token

def validar_csrf_token(token):
    esperado = session.get('_csrf_token')
    return isinstance(token, str) and isinstance(esperado, str) and hmac.compare_digest(token, esperado)

def requiere_autenticacion(view):
    @wraps(view)
    def protegido(*args, **kwargs):
        if not session.get('autenticado'):
            if request.path.startswith('/api/'):
                return jsonify({"status": "error", "message": "Inicia sesión para editar el menú."}), 401
            return redirect(url_for('login'))
        return view(*args, **kwargs)
    return protegido

# Acceso de administrador compartido, configurado fuera del código fuente.
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('autenticado'):
        return redirect(url_for('editor'))

    csrf = csrf_token()
    password_configurada = app.config['ADMIN_PASSWORD']
    error = None
    status = 200 if password_configurada else 503

    if request.method == 'POST':
        if not validar_csrf_token(request.form.get('csrf_token')):
            abort(400)
        if not password_configurada:
            error = "El acceso no está configurado. Define CARTORA_ADMIN_PASSWORD en el entorno del servidor."
            status = 503
        elif hmac.compare_digest(request.form.get('password', ''), password_configurada):
            session.clear()
            session['autenticado'] = True
            csrf_token()
            return redirect(url_for('editor'))
        else:
            error = "La contraseña no es correcta."
            status = 401

    return render_template(
        'login.html',
        csrf_token=csrf,
        error=error,
        password_configurada=bool(password_configurada)
    ), status

# Ruta principal: Editor de Menús
@app.route('/')
@requiere_autenticacion
def editor():
    # Usamos el usuario demo (id=1) para la prueba inicial
    user = Usuario.query.first()
    if not user:
        crear_usuario_demo()
        user = Usuario.query.first()

    if not user:
        return "No se pudo inicializar el usuario del editor.", 500

    menu = Menu.query.filter_by(usuario_id=user.id).first()
    contenido_json = menu.contenido_json if menu and menu.contenido_json else '{}'
    return render_template(
        'index.html',
        user=user,
        contenido_json=contenido_json,
        csrf_token=csrf_token()
    )

# Guardar menú vía API (POST desde JavaScript)
@app.route('/api/guardar-menu', methods=['POST'])
@requiere_autenticacion
def guardar_menu():
    if not validar_csrf_token(request.headers.get('X-CSRF-Token')):
        return jsonify({"status": "error", "message": "La sesión expiró o la solicitud no es válida. Recarga la página."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "La solicitud debe contener un objeto JSON."}), 400

    canvas_data = data.get('canvas')
    if isinstance(canvas_data, str):
        try:
            canvas_data = json.loads(canvas_data)
        except json.JSONDecodeError:
            return jsonify({"status": "error", "message": "El contenido del menú no es un JSON válido."}), 400

    if not isinstance(canvas_data, dict) or not isinstance(canvas_data.get('objects'), list):
        return jsonify({
            "status": "error",
            "message": "El contenido del menú debe incluir una lista de elementos."
        }), 400

    try:
        json_canvas = json.dumps(canvas_data, ensure_ascii=False, allow_nan=False)
    except ValueError:
        return jsonify({"status": "error", "message": "El contenido del menú incluye valores no válidos."}), 400

    user = Usuario.query.first()
    if not user:
        crear_usuario_demo()
        user = Usuario.query.first()

    if not user:
        return jsonify({"status": "error", "message": "No se pudo inicializar el usuario del menú."}), 500

    menu = Menu.query.filter_by(usuario_id=user.id).first()

    if not menu:
        menu = Menu(titulo="Menú Principal", contenido_json=json_canvas, usuario_id=user.id)
        db.session.add(menu)
    else:
        menu.contenido_json = json_canvas

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        app.logger.exception("No se pudo guardar el menú del usuario %s.", user.id)
        return jsonify({"status": "error", "message": "No se pudo guardar el menú. Inténtalo de nuevo."}), 500

    return jsonify({"status": "success", "message": "¡Menú guardado correctamente!"}), 200

@app.route('/logout', methods=['POST'])
@requiere_autenticacion
def logout():
    if not validar_csrf_token(request.form.get('csrf_token')):
        abort(400)
    session.clear()
    return redirect(url_for('login'))

# Vista pública del menú para clientes via slug
@app.route('/m/<slug>')
def menu_publico(slug):
    user = Usuario.query.filter_by(slug=slug).first_or_404()
    menu = Menu.query.filter_by(usuario_id=user.id).first()
    contenido_json = menu.contenido_json if menu and menu.contenido_json else '{}'
    return render_template('menu_publico.html', user=user, contenido_json=contenido_json)

if __name__ == '__main__':
    app.run(
        debug=os.environ.get('FLASK_DEBUG') == '1',
        port=int(os.environ.get('CARTORA_PORT', '5000'))
    )