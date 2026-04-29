export class ConfigValidationError extends Error {
  constructor(message, { errors = [], warnings = [], unknownKeys = [] } = {}) {
    super(message);
    this.name = "ConfigValidationError";
    this.errors = [...errors];
    this.warnings = [...warnings];
    this.unknownKeys = [...unknownKeys];
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errors: [...this.errors],
      warnings: [...this.warnings],
      unknownKeys: [...this.unknownKeys]
    };
  }
}
