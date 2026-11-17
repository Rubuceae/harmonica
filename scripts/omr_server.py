#!/usr/bin/env python3
"""Local Audiveris OMR server.

POST /omr with the raw image/PDF body and an X-Filename header.
The response is MusicXML text.

Requires Audiveris 5.x. By default it looks for
~/.local/opt/audiveris/bin/Audiveris, or a binary named "audiveris" in PATH.
Override with AUDIVERIS_BIN=/path/to/Audiveris.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DEFAULT_AUDIVERIS = os.path.expanduser("~/.local/opt/audiveris/bin/Audiveris")
AUDIVERIS_BIN = os.environ.get(
    "AUDIVERIS_BIN",
    DEFAULT_AUDIVERIS if os.path.exists(DEFAULT_AUDIVERIS) else "audiveris",
)
PORT = int(os.environ.get("OMR_PORT", "8001"))
MAX_UPLOAD = 30 * 1024 * 1024
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".pdf", ".bmp"}


def find_musicxml(folder: str) -> str | None:
    for root, _dirs, files in os.walk(folder):
        for name in files:
            if name.lower().endswith((".mxl", ".xml")):
                return os.path.join(root, name)
    return None


def read_musicxml(path: str) -> str:
    if path.lower().endswith(".mxl"):
        with zipfile.ZipFile(path) as archive:
            name = next(
                (
                    entry
                    for entry in archive.namelist()
                    if entry.lower().endswith(".xml") and not entry.startswith("META-INF/")
                ),
                None,
            )
            if name is None:
                raise RuntimeError("MusicXML 压缩包里没有 XML")
            return archive.read(name).decode("utf-8")
    with open(path, encoding="utf-8") as handle:
        return handle.read()


class Handler(BaseHTTPRequestHandler):
    server_version = "HarmonicaOMR/0.1"

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/omr":
            self._json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self._json(400, {"error": "empty upload"})
            return
        if length > MAX_UPLOAD:
            self._json(413, {"error": "file too large (max 30 MB)"})
            return

        data = self.rfile.read(length)
        filename = self.headers.get("X-Filename", "upload.png")
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            ext = ".png"

        with tempfile.TemporaryDirectory(prefix="harmonica-omr-") as work:
            image_path = os.path.join(work, f"input{ext}")
            with open(image_path, "wb") as handle:
                handle.write(data)
            out_dir = os.path.join(work, "out")
            os.makedirs(out_dir, exist_ok=True)
            cmd = [AUDIVERIS_BIN, "-batch", "-export", "-output", out_dir, "-force", image_path]
            try:
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=300,
                )
            except FileNotFoundError:
                self._json(
                    500,
                    {
                        "error": (
                            f"找不到 Audiveris：{AUDIVERIS_BIN}。"
                            "请安装 Audiveris 5.x，或设置 AUDIVERIS_BIN。"
                        )
                    },
                )
                return
            except subprocess.TimeoutExpired:
                self._json(504, {"error": "OMR 超时（300s）"})
                return

            if proc.returncode != 0:
                tail = "\n".join(proc.stdout.splitlines()[-8:])
                self._json(502, {"error": f"Audiveris 失败：\n{tail}"})
                return

            xml_path = find_musicxml(out_dir)
            if not xml_path:
                tail = "\n".join(proc.stdout.splitlines()[-8:])
                self._json(422, {"error": f"没有导出 MusicXML。\n{tail}"})
                return

            try:
                xml = read_musicxml(xml_path)
            except Exception as exc:  # noqa: BLE001
                self._json(500, {"error": f"读取 MusicXML 失败：{exc}"})
                return

        body = xml.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(fmt % args + "\n")


def main() -> None:
    if not (os.path.exists(AUDIVERIS_BIN) or shutil.which(AUDIVERIS_BIN)):
        sys.stderr.write(
            f"找不到 Audiveris：{AUDIVERIS_BIN}\n"
            "请安装 Audiveris 5.x，或设置 AUDIVERIS_BIN=/path/to/Audiveris\n"
        )
    print(f"OMR server listening on http://localhost:{PORT}")
    print(f"Audiveris: {AUDIVERIS_BIN}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
