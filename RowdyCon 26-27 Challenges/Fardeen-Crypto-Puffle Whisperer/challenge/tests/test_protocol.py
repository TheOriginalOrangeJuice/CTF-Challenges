import base64
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))

from protocol import ProtocolError, decode_message, encode_wire, encoded_flag_in_reply, model_message, wire_values


class TranslatorProtocolTests(unittest.TestCase):
    def test_plain_and_prefix_collision(self):
        self.assertIsNone(decode_message("hello hex: 41").encoding)
        self.assertIsNone(decode_message("hexagon: 41").encoding)
        self.assertEqual(decode_message(" ordinary chat ").text, "ordinary chat")

    def test_base64_case_and_wrapped_whitespace(self):
        self.assertEqual(decode_message("B64: SGkg\nUGlwIQ==").text, "Hi Pip!")

    def test_hex_continuous_and_spaced(self):
        self.assertEqual(decode_message("hex: 64616e6365").text, "dance")
        self.assertEqual(decode_message("HEX: 64 61 6E 63 65").text, "dance")

    def test_decimal_spaces_and_commas(self):
        self.assertEqual(decode_message("dec: 115 110 111 119").text, "snow")
        self.assertEqual(decode_message("DEC: 115,110,111,119").text, "snow")

    def test_binary_bytes(self):
        self.assertEqual(decode_message("bin: 01110111 01100001 01110110 01100101").text, "wave")
        self.assertEqual(decode_message("BIN: 01110111 01100001 01110110 01100101").text, "wave")

    def test_utf8_round_trip_all_formats(self):
        for encoding, wire in wire_values("Hi, Pip ☃").items():
            decoded = decode_message(wire)
            self.assertEqual((decoded.encoding, decoded.text), (encoding, "Hi, Pip ☃"))

    def test_wire_format_is_canonical(self):
        self.assertEqual(encode_wire("A", "b64"), "b64: QQ==")
        self.assertEqual(encode_wire("A", "hex"), "hex: 41")
        self.assertEqual(encode_wire("A", "dec"), "dec: 65")
        self.assertEqual(encode_wire("A", "bin"), "bin: 01000001")

    def test_empty_and_malformed_packets(self):
        invalid = [
            "b64:", "b64: ###", "b64: QQ=", "hex:", "hex: 4", "hex: 4g",
            "dec:", "dec: one", "dec: 256", "bin:", "bin: 1", "bin: 0100000x",
        ]
        for packet in invalid:
            with self.subTest(packet=packet), self.assertRaises(ProtocolError):
                decode_message(packet)

    def test_invalid_utf8_control_and_blank(self):
        for packet in ["hex: ff", "hex: 0d", "b64: ICA="]:
            with self.subTest(packet=packet), self.assertRaises(ProtocolError):
                decode_message(packet)

    def test_tab_and_newline_are_allowed(self):
        packet = "b64: " + base64.b64encode(b"line one\n\tline two").decode()
        self.assertEqual(decode_message(packet).text, "line one\n\tline two")

    def test_decoded_length_boundary(self):
        self.assertEqual(len(decode_message(encode_wire("x" * 2000, "b64")).text), 2000)
        with self.assertRaises(ProtocolError):
            decode_message(encode_wire("x" * 2001, "b64"))
        self.assertEqual(len(decode_message("x" * 2000).text), 2000)
        with self.assertRaises(ProtocolError):
            decode_message("x" * 2001)

    def test_model_envelope_never_contains_raw_encoding(self):
        message = model_message("Hi Pip!", "hex")
        self.assertIn("HEX byte transmission", message)
        self.assertIn("visitor-provided data", message.lower())
        self.assertIn("Hi Pip!", message)
        self.assertNotIn("48 69", message)
        self.assertEqual(model_message("Hi Pip!", None), "Hi Pip!")

    def test_disclosure_requires_exact_decoded_flag(self):
        flag = "RCC{puffles_cannot_keep_secrets_7c92}"
        for encoding, packet in wire_values(flag).items():
            self.assertEqual(encoded_flag_in_reply(packet, flag), encoding)
            self.assertEqual(encoded_flag_in_reply(f"```\n{packet}\n```", flag), encoding)
        self.assertIsNone(encoded_flag_in_reply(encode_wire(flag + "x", "hex"), flag))
        self.assertIsNone(encoded_flag_in_reply(encode_wire(flag, "hex") + " trailing text", flag))
        self.assertIsNone(encoded_flag_in_reply(flag, flag))


if __name__ == "__main__":
    unittest.main()
