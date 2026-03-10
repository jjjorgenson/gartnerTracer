## 2. Authentication

The system uses JWT (JSON Web Token) based authentication. Clients must pass a valid Bearer token in the `Authorization` header using the following format:

```
Authorization: Bearer <token>
```

The token is verified against the `JWT_SECRET` environment variable. Requests without a valid Bearer token will receive an `Unauthorized` error.