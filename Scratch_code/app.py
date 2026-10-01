import os
from flask import Flask, render_template, request, jsonify
from database import (
    init_db,
    create_conversation,
    get_conversations,
    get_conversation_with_messages,
    add_message,
    update_conversation_title,
    delete_conversation,
    get_db
)
from chatbot import (
    get_personas_list,
    generate_ai_response,
    generate_conversation_title,
    validate_gemini_api_key,
    save_gemini_api_key,
    get_ai_status,
    PERSONAS
)

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['JSON_SORT_KEYS'] = False

# Ensure database tables exist
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/settings/ai', methods=['GET'])
def ai_status():
    return jsonify(get_ai_status())

@app.route('/api/settings/ai', methods=['POST'])
def save_ai_key():
    data = request.get_json() or {}
    api_key = data.get('api_key', '').strip()
    if not api_key:
        return jsonify({"error": "API Key cannot be empty"}), 400

    valid, msg_or_model = validate_gemini_api_key(api_key)
    if not valid:
        return jsonify({"error": f"Invalid Gemini API Key: {msg_or_model}"}), 400

    save_gemini_api_key(api_key)
    return jsonify({
        "success": True,
        "model": msg_or_model,
        "message": "Google Gemini AI connected successfully! Responses will now be generated with live Gemini models."
    })

@app.route('/api/personas', methods=['GET'])
def get_personas():
    return jsonify(get_personas_list())

@app.route('/api/conversations', methods=['GET'])
def list_conversations():
    return jsonify(get_conversations())

@app.route('/api/conversations', methods=['POST'])
def new_conversation():
    data = request.get_json() or {}
    persona = data.get('persona', 'general')
    title = data.get('title', 'New Chat')
    conv = create_conversation(persona=persona, title=title)
    return jsonify(conv), 201

@app.route('/api/conversations/<conv_id>', methods=['GET'])
def get_conversation(conv_id):
    conv = get_conversation_with_messages(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify(conv)

@app.route('/api/conversations/<conv_id>', methods=['DELETE'])
def remove_conversation(conv_id):
    delete_conversation(conv_id)
    return jsonify({"success": True})

@app.route('/api/conversations/<conv_id>', methods=['PATCH'])
def update_conversation(conv_id):
    data = request.get_json() or {}
    title = data.get('title')
    if title:
        update_conversation_title(conv_id, title)
    return jsonify({"success": True})

@app.route('/api/conversations/<conv_id>/clear', methods=['POST'])
def clear_conversation(conv_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conv_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json() or {}
    user_prompt = data.get('message', '').strip()
    conv_id = data.get('conversation_id')
    persona_id = data.get('persona', 'general')
    # puter.js sends the AI-generated text when it handles the response client-side
    prefetched_response = data.get('prefetched_response', '').strip()

    if not user_prompt:
        return jsonify({"error": "Message cannot be empty"}), 400

    # Ensure conversation exists
    is_new = False
    conv = None
    if conv_id:
        conv = get_conversation_with_messages(conv_id)
    
    if not conv:
        is_new = True
        auto_title = generate_conversation_title(user_prompt)
        conv = create_conversation(persona=persona_id, title=auto_title)
        conv_id = conv['id']
        conv['messages'] = []

    # Store user message
    user_msg = add_message(conv_id, 'user', user_prompt)

    # Auto-generate title on first message if currently "New Chat" or "New Conversation"
    if conv['title'] in ['New Chat', 'New Conversation'] and len(conv.get('messages', [])) == 0:
        new_title = generate_conversation_title(user_prompt)
        update_conversation_title(conv_id, new_title)
        conv['title'] = new_title

    # Use the pre-generated response from puter.js if available, otherwise call local engine
    if prefetched_response:
        assistant_content = prefetched_response
    else:
        assistant_content = generate_ai_response(
            prompt=user_prompt,
            persona_id=persona_id,
            history=conv.get('messages', [])
        )

    # Store assistant response
    assistant_msg = add_message(conv_id, 'assistant', assistant_content)

    return jsonify({
        "conversation_id": conv_id,
        "title": conv['title'],
        "user_message": user_msg,
        "assistant_message": assistant_msg
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Chatbot server running locally at http://127.0.0.1:{port} and on network at http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
