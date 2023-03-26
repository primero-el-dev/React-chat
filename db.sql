CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    email VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nick VARCHAR(80) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE room (
    id SERIAL PRIMARY KEY
);

CREATE TABLE user_room (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES room(id) ON DELETE CASCADE,
    UNIQUE (user_id, room_id)
);

CREATE TABLE message (
    id SERIAL PRIMARY KEY,
    content VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES room(id) ON DELETE CASCADE
);

CREATE TABLE user_room_message_not_seen (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES room(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES message(id) ON DELETE CASCADE
);