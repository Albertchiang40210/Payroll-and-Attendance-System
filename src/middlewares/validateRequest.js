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
            if (!error.issues) return next(error);
            return res.status(400).json({
                status: 'fail',
                errors: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            });
        }
    };
};

module.exports = validateRequest;
