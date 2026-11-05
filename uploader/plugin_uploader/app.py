"""Desktop window for the plugin uploader. Run with ``python -m plugin_uploader.app`` or the built exe."""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext

from openpyxl import load_workbook

from plugin_uploader import __version__
from plugin_uploader.api import IngestApi
from plugin_uploader.config import load_config
from plugin_uploader.core import Category, UploaderError, new_batch_id, read_rows, run_batch
from plugin_uploader.storage import R2Storage


def app_folder() -> Path:
    """The folder with the exe (or the project folder when run from source)."""
    import sys

    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def write_plugin_ids(sheet_path: Path, saved: list[tuple[int, str]]) -> None:
    """Save each new Plugin ID into the sheet, so the next run reuses it instead of making another."""
    if not saved:
        return
    workbook = load_workbook(sheet_path)
    sheet = workbook.active
    headers = {str(cell.value or "").strip().lower(): cell.column for cell in sheet[1]}
    column = headers.get("plugin id") or sheet.max_column + 1
    if "plugin id" not in headers:
        sheet.cell(row=1, column=column, value="Plugin ID")
    for row_number, plugin_id in saved:
        sheet.cell(row=row_number, column=column, value=plugin_id)
    workbook.save(sheet_path)


class UploaderApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"Plugin Uploader {__version__}")
        self.geometry("760x520")
        self.sheet_path: Path | None = None
        self.plugin_root: Path | None = None
        self.messages: queue.Queue[str] = queue.Queue()
        self.running = False

        frame = tk.Frame(self, padx=12, pady=12)
        frame.pack(fill="both", expand=True)

        self.sheet_label = tk.Label(frame, text="No Excel sheet chosen", anchor="w")
        self.sheet_label.pack(fill="x")
        tk.Button(frame, text="Choose Excel sheet", command=self.choose_sheet).pack(anchor="w", pady=(4, 10))

        self.root_label = tk.Label(frame, text="No plugin folder chosen", anchor="w")
        self.root_label.pack(fill="x")
        tk.Button(frame, text="Choose plugin folder", command=self.choose_root).pack(anchor="w", pady=(4, 10))

        self.run_button = tk.Button(frame, text="Check and upload", command=self.start_run)
        self.run_button.pack(anchor="w", pady=(0, 10))

        self.log = scrolledtext.ScrolledText(frame, height=20, state="disabled", wrap="word")
        self.log.pack(fill="both", expand=True)

        self.after(150, self.drain_messages)

    def say(self, text: str) -> None:
        self.messages.put(f"{datetime.now():%H:%M:%S}  {text}")

    def drain_messages(self) -> None:
        while True:
            try:
                text = self.messages.get_nowait()
            except queue.Empty:
                break
            self.log.configure(state="normal")
            self.log.insert("end", text + "\n")
            self.log.see("end")
            self.log.configure(state="disabled")
        self.after(150, self.drain_messages)

    def choose_sheet(self) -> None:
        path = filedialog.askopenfilename(filetypes=[("Excel", "*.xlsx")])
        if path:
            self.sheet_path = Path(path)
            self.sheet_label.configure(text=f"Sheet: {path}")

    def choose_root(self) -> None:
        path = filedialog.askdirectory()
        if path:
            self.plugin_root = Path(path)
            self.root_label.configure(text=f"Plugin folder: {path}")

    def start_run(self) -> None:
        if self.running:
            return
        if not self.sheet_path or not self.plugin_root:
            messagebox.showwarning("Missing input", "Choose the Excel sheet and the plugin folder first.")
            return
        self.running = True
        self.run_button.configure(state="disabled")
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self) -> None:
        try:
            config = load_config(app_folder())
            api = IngestApi(config.api_base_url, config.api_key)
            storage = R2Storage(config.r2)
            sheet_rows = list(load_workbook(self.sheet_path, data_only=True).active.iter_rows(values_only=True))
            rows = read_rows(sheet_rows)
            categories = [Category(code=c["code"], name=c["name"]) for c in api.next_ids()["categories"]]
            self.say(f"{len(rows)} row(s) in the sheet. Checking files, then uploading.")

            report, saved = run_batch(
                rows,
                categories=categories,
                plugin_root=self.plugin_root,
                api=api,
                storage=storage,
                batch_id=new_batch_id(),
            )
            write_plugin_ids(self.sheet_path, saved)
            for row in report.rows:
                self.say(f"Row {row.row_number} {row.name} {row.plugin_id}: {row.status}. {row.message}")
            imported = sum(1 for row in report.rows if row.status == "imported")
            self.say(f"Done. {imported} imported and waiting for review in the admin Plugins panel.")
        except UploaderError as exc:
            self.say(f"Stopped: {exc}")
        except Exception as exc:  # noqa: BLE001 - show any unexpected error instead of closing
            self.say(f"Unexpected error: {exc}")
        finally:
            self.running = False
            self.after(0, lambda: self.run_button.configure(state="normal"))


def main() -> None:
    UploaderApp().mainloop()


if __name__ == "__main__":
    main()
