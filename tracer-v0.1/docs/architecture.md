# System Architecture

## 1. Overview
The Mopac API provides backend services for the client application. It is built on Node.js and Express.

## 2. Authentication
Currently, the system uses basic authentication. Clients must pass a base64 encoded string of their username and password in the Authorization header.
We plan to migrate this to token-based auth in Q3.

## 3. Database
We use PostgreSQL. Connection pooling is handled by pg-pool.
