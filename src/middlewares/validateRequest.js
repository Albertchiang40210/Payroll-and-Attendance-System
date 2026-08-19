const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        } catch (error) {
            return res.status(400).json({
                status: 'fail',
                errors: error.errors,
            });
        }
    };
};

module.exports = validateRequest;
