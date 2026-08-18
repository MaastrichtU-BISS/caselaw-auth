"""The Python half of the shared conformance suite.

Cases are loaded from ``packages/contract/conformance/cases.json`` by relative
path, never copied here. One copy is the entire anti-drift guarantee: a case
inlined into a language's own tests is a case that stops constraining the other
implementation the moment someone edits it.

The TypeScript half reads the same file.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from caselaw_auth_server import (
    COOKIE_BYTE_LIMIT,
    SessionTooLarge,
    create_pkce_pair,
    create_server_auth,
)
from caselaw_auth_server.server import _b64url_encode, _dumps

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "contract"
CASES = json.loads((CONTRACT_DIR / "conformance" / "cases.json").read_text())
CONTRACT = json.loads((CONTRACT_DIR / "contract.json").read_text())


def auth(client_id: str = "conformance-client", secret: str | None = None):
    return create_server_auth(
        issuer="https://auth.example.org/realms/caselaw",
        client_id=client_id,
        redirect_uri="https://example.org/auth/callback",
        session_secret=secret or CASES["secret"],
    )


# ── sealing ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("case", CASES["seal"]["cases"], ids=lambda c: c["name"])
def test_seal_matches_the_pinned_payload(case):
    """Byte-exact, not merely round-trippable.

    Two implementations that each read their own cookies but write different
    ones would pass a weaker test and still be unable to hand a session to each
    other.
    """
    sealed = auth().seal_session(case["session"])
    assert sealed.split(".")[0] == case["expected"]


def test_seal_round_trips():
    a = auth()
    session = {
        "user": {"id": "u", "email": None, "name": None},
        "roles": ["admin"],
        "expiresAt": int(time.time()) + 3600,
    }
    assert a.unseal_session(a.seal_session(session)) == session


def test_seal_refuses_an_oversized_session():
    a = auth()
    with pytest.raises(SessionTooLarge):
        a.seal_session(
            {
                "user": {"id": "u", "email": None, "name": None},
                "roles": [],
                "expiresAt": int(time.time()) + 3600,
                "bloat": "x" * COOKIE_BYTE_LIMIT,
            }
        )


# ── unsealing ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("case", CASES["unseal_rejects"]["cases"], ids=lambda c: c["name"])
def test_unseal_rejects(case):
    assert auth().unseal_session(case["value"]) is None


def test_unseal_rejects_none():
    assert auth().unseal_session(None) is None


def test_unseal_rejects_an_expired_session():
    """Valid signature, past expiry. Must still yield nothing."""
    a = auth()
    sealed = a.seal_session(CASES["unseal_rejects_expired"]["session"])
    assert a.unseal_session(sealed) is None


def test_unseal_rejects_a_session_signed_with_another_secret():
    sealed = auth(secret="a-different-secret").seal_session(
        {
            "user": {"id": "u", "email": None, "name": None},
            "roles": ["admin"],
            "expiresAt": int(time.time()) + 3600,
        }
    )
    assert auth().unseal_session(sealed) is None


def test_unseal_rejects_an_edited_payload():
    """The attack the signature exists to stop: promote yourself by editing a role."""
    a = auth()
    session = {
        "user": {"id": "u", "email": None, "name": None},
        "roles": ["researcher"],
        "expiresAt": int(time.time()) + 3600,
    }
    _, signature = a.seal_session(session).split(".")
    forged = _b64url_encode(_dumps({**session, "roles": ["admin"]}).encode("utf-8"))
    assert a.unseal_session(f"{forged}.{signature}") is None


# ── claim mapping ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "case", CASES["session_from_claims"]["cases"], ids=lambda c: c["name"]
)
def test_session_from_claims(case):
    a = auth(client_id=CASES["session_from_claims"]["clientId"])
    session = a.session_from_claims(case["claims"])
    assert session["user"] == case["expected"]["user"]
    assert session["roles"] == case["expected"]["roles"]


def test_session_expiry_is_the_applications_own_ttl():
    """Not the token's. Reading expiry off a token makes session length hostage
    to clock drift between two machines."""
    a = auth()
    session = a.session_from_claims({"sub": "u", "exp": 1})
    assert session["expiresAt"] > time.time() + 7 * 3600


def test_session_does_not_carry_an_access_token():
    session = auth().session_from_claims({"sub": "u"}, id_token="id-token")
    assert "accessToken" not in session
    assert session["idToken"] == "id-token"


# ── PKCE and URLs ────────────────────────────────────────────────────────────


def test_pkce_challenge_matches_the_pinned_verifier():
    import hashlib

    verifier = CASES["pkce"]["verifier"]
    challenge = _b64url_encode(hashlib.sha256(verifier.encode()).digest())
    assert challenge == CASES["pkce"]["challenge"]


def test_pkce_pair_is_self_consistent():
    import hashlib

    verifier, challenge = create_pkce_pair()
    assert challenge == _b64url_encode(hashlib.sha256(verifier.encode()).digest())


def test_cookie_options_match_the_contract():
    options = auth().cookie_options(3600)
    for key, value in CASES["cookie_options"]["expected"].items():
        assert options[key] == value


def test_serialised_cookie_carries_the_flags():
    a = auth()
    header = a.serialize_cookie("caselaw_session", "v", a.cookie_options(3600))
    assert "HttpOnly" in header and "Secure" in header and "SameSite=Lax" in header


def test_contract_and_cases_agree_on_the_byte_limit():
    assert CONTRACT["session_cookie"]["byte_limit"] == COOKIE_BYTE_LIMIT
