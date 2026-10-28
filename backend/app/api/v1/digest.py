from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from app.core.deps import DbSession
from app.services import digest_service

router = APIRouter(prefix="/digest", tags=["Digest"])


@router.get("/unsubscribe", response_class=HTMLResponse)
def confirm_unsubscribe(token: str = Query(max_length=2000)):
    # GET only confirms: email scanners must not silently unsubscribe people.
    return HTMLResponse(
        '<html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width">'
        "<title>ArabDev — إلغاء الاشتراك</title><h1>إلغاء النشرة الأسبوعية / Unsubscribe</h1>"
        '<form method="post"><button type="submit">تأكيد إلغاء الاشتراك / Confirm unsubscribe</button></form></html>',
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.post("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(db: DbSession, token: str = Query(max_length=2000)):
    digest_service.unsubscribe(db, token)
    return HTMLResponse(
        '<html lang="ar" dir="rtl"><h1>تم إلغاء الاشتراك / Unsubscribed</h1></html>',
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
