import { Request, Response, NextFunction } from 'express';
import { QualGenError } from '../../shared/types';
import { log } from '../../shared/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  log.error('Request error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle known error types
  if (error instanceof QualGenError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: error.message,
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle syntax errors
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: 'Invalid JSON in request body',
      code: 'SYNTAX_ERROR',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Default to 500 internal server error
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
}
