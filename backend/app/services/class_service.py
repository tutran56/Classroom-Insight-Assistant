from pathlib import Path
from app.core.config import settings


def _build_class_item(class_dir: Path) -> dict:
    class_key = class_dir.name
    class_name = class_key.replace("_", " ").title()

    annotated_video = class_dir / "annotated_video.mp4"
    events_csv = class_dir / "events_frame.csv"
    segments_csv = class_dir / "phone_segments.csv"
    result_json = class_dir / "result.json"
    clips_dir = class_dir / "clips"

    return {
        "class_key": class_key,
        "class_name": class_name,
        "folder_path": str(class_dir),
        "annotated_video_path": str(annotated_video) if annotated_video.exists() else None,
        "events_csv_path": str(events_csv) if events_csv.exists() else None,
        "segments_csv_path": str(segments_csv) if segments_csv.exists() else None,
        "result_json_path": str(result_json) if result_json.exists() else None,
        "clips_dir_path": str(clips_dir) if clips_dir.exists() and clips_dir.is_dir() else None,
        "annotated_video_url": f"/static/demo_outputs/{class_key}/annotated_video.mp4" if annotated_video.exists() else None,
        "has_annotated_video": annotated_video.exists(),
        "has_events_csv": events_csv.exists(),
        "has_segments_csv": segments_csv.exists(),
        "has_result_json": result_json.exists(),
        "has_clips_dir": clips_dir.exists() and clips_dir.is_dir(),
    }


def list_classes() -> list[dict]:
    base_dir = settings.DEMO_OUTPUTS_DIR
    if not base_dir.exists():
        return []

    class_dirs = [p for p in base_dir.iterdir() if p.is_dir()]
    class_dirs = sorted(class_dirs, key=lambda p: p.name)

    return [_build_class_item(class_dir) for class_dir in class_dirs]


def get_class_by_key(class_key: str) -> dict | None:
    class_dir = settings.DEMO_OUTPUTS_DIR / class_key
    if not class_dir.exists() or not class_dir.is_dir():
        return None

    return _build_class_item(class_dir)
