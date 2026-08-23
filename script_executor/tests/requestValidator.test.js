const { validateAnalyzeRequest } = require('../src/middleware/requestValidator');

describe('validateAnalyzeRequest middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() for a valid script payload', () => {
    req.body = { script: 'echo "hello world"' };
    validateAnalyzeRequest(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 when body is missing or not an object', () => {
    req.body = null;
    validateAnalyzeRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when script field is missing', () => {
    req.body = {};
    validateAnalyzeRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Missing required field') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when script field is not a string', () => {
    req.body = { script: 12345 };
    validateAnalyzeRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('must be a string') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when script is empty or whitespace only', () => {
    req.body = { script: '    ' };
    validateAnalyzeRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('must not be empty') }));
    expect(next).not.toHaveBeenCalled();
  });
});
