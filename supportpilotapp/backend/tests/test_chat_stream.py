from app.api.chat import _words


def test_words_rejoin_to_original_text():
    t = "We found a duplicate charge of $20.00 and have refunded it."
    assert "".join(_words(t)) == t


def test_words_handles_newlines_and_empty():
    assert _words("") == []
    assert "".join(_words("a  b\nc")) == "a  b\nc"