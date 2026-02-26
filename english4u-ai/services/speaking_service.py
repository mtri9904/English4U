from models.speaking_models import SpeakingFeedbackRequest, SpeakingFeedbackResponse

class SpeakingService:
    def __init__(self):
        pass

    async def generate_feedback(self, request: SpeakingFeedbackRequest) -> SpeakingFeedbackResponse:
        return SpeakingFeedbackResponse(
            band_score=0.0,
            pronunciation=0.0,
            fluency=0.0,
            grammar=0.0,
            vocabulary=0.0,
            detailed_feedback=""
        )
