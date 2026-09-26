// A known, expected error (bad input, forbidden action, business rule broken).
// The error handler sends its status code and message to the client as-is.
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = AppError;
