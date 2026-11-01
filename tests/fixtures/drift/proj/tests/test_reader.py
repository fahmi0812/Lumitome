from src.reader import read


def test_read(tmp_path):
    f = tmp_path / "a.txt"
    f.write_text("x")
    assert read(f) == "x"
