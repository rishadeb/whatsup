from urllib.parse import parse_qsl, urlencode

from backend.app.main import app as fastapi_app

# vercel.json rewrites /api/<path> to /api/index.py?__path=<path>. Depending on
# the runtime version, Vercel may hand the function the rewritten path
# (/api/index.py) instead of the original one, which breaks FastAPI routing.
# Restore the original path from the query parameter before routing.
PATH_PARAM = "__path"


async def app(scope, receive, send):
    if scope["type"] == "http":
        query = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
        original = [value for key, value in query if key == PATH_PARAM]
        if original:
            path = "/api/" + original[-1].lstrip("/")
            remaining = [(key, value) for key, value in query if key != PATH_PARAM]
            scope = dict(scope)
            scope["path"] = path
            scope["raw_path"] = path.encode("utf-8")
            scope["query_string"] = urlencode(remaining).encode("latin-1")
    await fastapi_app(scope, receive, send)
