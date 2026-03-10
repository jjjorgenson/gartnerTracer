# System Architecture

## 1. Overview
The Mopac API provides backend services for the client application. It is built on Node.js and Express.

## 2. Authentication
The system uses JWT (JSON Web Token) based authentication. Clients must pass a valid JWT in the `Authorization` header using the `Bearer` scheme:

```
Authorization: Bearer <token>
```

The token is verified against the secret defined in the `JWT_SECRET` environment variable. Requests missing a token will receive an `Unauthorized` error.

## 3. Database
We use PostgreSQL. Connection pooling is handled by pg-pool.