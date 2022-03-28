"use strict";
module.exports = (fastify, _, done) => {
    fastify.get("/", (req, res) => res.redirect("/dash/guilds"));
    fastify.get("/guilds", async (req, res) => {
        req.session.lastPage = "/dash/guilds";
        if (!req.session.user)
            return res.redirect("/api/login");
        res.view("dash/guilds.ejs", { user: req.session.user });
    });
    done();
};