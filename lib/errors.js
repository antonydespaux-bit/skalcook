/**
 * Classes d'exceptions personnalisées pour les routes API Next.js.
 * Équivalent Next.js du @ControllerAdvice / @ExceptionHandler Spring.
 */

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class AuthError extends ApiError {
  constructor(message = 'Non authentifié') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Accès refusé') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Données invalides', details = null) {
    super(message, 400)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Ressource introuvable') {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflit de données') {
    super(message, 409)
    this.name = 'ConflictError'
  }
}
