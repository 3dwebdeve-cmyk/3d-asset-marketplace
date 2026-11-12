import base64
from io import BytesIO
from zipfile import ZipFile
from unittest.mock import patch
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory
from contact.services import ContactService, ContactSubmissionData, project_detail_rows, reference_zip
from contact.views import ContactSubmissionView
from contact.serializers import ContactSubmissionSerializer

@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', CONTACT_ADMIN_RECIPIENTS='3dwebdeve@gmail.com')
class ContactAttachmentTests(SimpleTestCase):
    def test_upload_survives_queue_and_is_attached_to_formatted_email(self):
        content = b'reference-image-content'
        request = APIRequestFactory().post('/api/v1/contact/', {
            'name': 'Alex Creator', 'email': 'alex@example.com', 'subject': 'Hive Studio: Product renders',
            'message': 'Project: Chair renders\n\nSpecifications: <script>alert(1)</script>',
            'attachments': [SimpleUploadedFile('chair.png', content, content_type='image/png')],
        }, format='multipart')
        with patch.object(ContactSubmissionView, 'throttle_classes', []), patch('contact.services.enqueue_after_commit') as queue:
            response = ContactSubmissionView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        args = queue.call_args.args
        self.assertEqual(base64.b64decode(args[5][0]['content']), content)
        data = ContactSubmissionData(name=args[1], email=args[2], subject=args[3], message=args[4], attachments=args[5])
        with patch('contact.services.MailLogService.record_queued', return_value='log'), patch('contact.services.MailLogService.mark_sent'):
            ContactService.deliver(data)
        email = mail.outbox[-1]
        self.assertEqual(email.to, ['3dwebdeve@gmail.com'])
        self.assertEqual(email.reply_to, ['alex@example.com'])
        self.assertEqual(len(email.attachments), 1)
        self.assertEqual(email.attachments[0].filename, 'project-reference-files.zip')
        self.assertEqual(email.attachments[0].mimetype, 'application/zip')
        with ZipFile(BytesIO(email.attachments[0].content)) as archive:
            self.assertEqual(archive.namelist(), ['chair.png'])
            self.assertEqual(archive.read('chair.png'), content)
        self.assertIn('project-reference-files.zip', email.body)
        html = email.alternatives[0].content
        self.assertIn('Reference files (1)', html)
        self.assertIn('chair.png', html)
        self.assertIn('alex@example.com', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<script>', html)
        self.assertIn('text-align:left', html)
        self.assertIn('PROJECT DETAILS &amp; SPECIFICATIONS', html)
        self.assertIn('scope="col"', html)
        self.assertIn('>Key</th>', html)
        self.assertIn('>Details</th>', html)
        self.assertIn('>Project</th>', html)

    def test_invalid_files_are_rejected(self):
        for files in [[SimpleUploadedFile('bad.exe', b'bad')], [SimpleUploadedFile('large.png', b'x' * (10 * 1024 * 1024 + 1))], [SimpleUploadedFile(f'{i}.png', b'x') for i in range(11)]]:
            serializer = ContactSubmissionSerializer(data={'name': 'Alex Creator', 'email': 'alex@example.com', 'subject': 'Project enquiry', 'message': 'Please render a chair.', 'attachments': files})
            self.assertFalse(serializer.is_valid())
            self.assertIn('attachments', serializer.errors)

    def test_failure_is_logged_and_raised_for_retry(self):
        data = ContactSubmissionData('Alex Creator', 'alex@example.com', 'Project enquiry', 'Please render a chair.')
        with patch('contact.services.MailLogService.record_queued', return_value='log'), patch('contact.services.MailLogService.mark_failed') as failed, patch('config.mail.EmailMultiAlternatives.send', side_effect=RuntimeError('provider down')):
            with self.assertRaises(RuntimeError):
                ContactService.deliver(data)
        failed.assert_called_once_with('log', 'provider down')

    def test_detail_rows_preserve_multiline_text_and_colons(self):
        rows = project_detail_rows('Services: Modeling\n\nProject: Chair\nTwo material variants\n\nLinks: https://example.com/model?id=1\n\nPhone: ')
        self.assertEqual(rows, [
            {'label': 'Services', 'value': 'Modeling'},
            {'label': 'Project', 'value': 'Chair\nTwo material variants'},
            {'label': 'Links', 'value': 'https://example.com/model?id=1'},
            {'label': 'Phone', 'value': 'Not specified'},
        ])
        self.assertEqual(project_detail_rows('Please help with my order.'), [{'label': 'Message', 'value': 'Please help with my order.'}])

    def test_zip_preserves_all_files_and_handles_duplicate_names_safely(self):
        files = [
            {'name': '../../chair.png', 'content': base64.b64encode(b'first').decode()},
            {'name': 'chair.png', 'content': base64.b64encode(b'second').decode()},
            {'name': 'C:\\folder\\table.jpg', 'content': base64.b64encode(b'third').decode()},
        ]
        attachment = reference_zip(files)[0]
        with ZipFile(BytesIO(attachment[1])) as archive:
            self.assertEqual(archive.namelist(), ['chair.png', 'chair (2).png', 'table.jpg'])
            self.assertEqual([archive.read(name) for name in archive.namelist()], [b'first', b'second', b'third'])
        self.assertEqual(reference_zip([]), [])
