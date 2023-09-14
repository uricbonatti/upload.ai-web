import { FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  ChangeEvent,
  FormEvent,
  Fragment,
  useMemo,
  useRef,
  useState,
} from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { api } from "@/lib/axios";

interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void;
}

type Status =
  | "waiting"
  | "converting"
  | "uploading"
  | "transcribing"
  | "success";

const statusMessages = {
  waiting: "Aguardando",
  converting: "Convertendo...",
  uploading: "Carregando...",
  transcribing: "Transcrevendo...",
  success: "Sucesso!",
};

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("waiting");

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const previewUrl = useMemo(() => {
    if (!videoFile) {
      return null;
    }

    return URL.createObjectURL(videoFile);
  }, [videoFile]);

  async function convertVideoToAudio(video: File) {
    console.log("Convert started...");

    const ffmpeg = await getFFmpeg();

    await ffmpeg.writeFile("input.mp4", await fetchFile(video));

    // ffmpeg.on('log', (message) => console.log(message));

    ffmpeg.on("progress", (progress) => {
      console.log("Convert progress", Math.round(progress.progress * 100));
    });

    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-map",
      "0:a",
      "-b:a",
      "20k",
      "-acodec",
      "libmp3lame",
      "output.mp3",
    ]);

    const data = await ffmpeg.readFile("output.mp3");
    const blobData = new Blob([data], { type: "audio/mp3" });

    const audioFile = new File([blobData], "audio.mp3", {
      type: "audio/mpeg",
    });

    console.log("Convert finished.");

    return audioFile;
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;

    if (!files) {
      return;
    }

    const selectedFile = files[0];

    setVideoFile(selectedFile);
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = promptInputRef.current?.value;
    if (!videoFile) {
      return;
    }

    //converter video em audio
    setStatus("converting");
    const audioFile = await convertVideoToAudio(videoFile);

    const data = new FormData();
    data.append("file", audioFile);

    setStatus("uploading");

    const response = await api.post("/videos", data);

    const videoId = response.data.video.id;

    console.log("Transcription started...");
    setStatus("transcribing");

    await api.post(`/videos/${videoId}/transcription`, {
      prompt,
    });

    console.log("Transcription finished.");
    setStatus("success");
    props.onVideoUploaded(videoId);
  }

  return (
    <form className="space-y-6" onSubmit={handleUploadVideo}>
      <label
        htmlFor="video"
        className="relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 justify-center items-center text-muted-foreground hover:bg-primary-foreground hover:text-primary/8"
      >
        {videoFile ? (
          <video
            src={previewUrl || undefined}
            controls={false}
            className="pointer-events-none aboslute inset-0"
          />
        ) : (
          <Fragment>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </Fragment>
        )}
      </label>
      <input
        type="file"
        id="video"
        accept="video/mp4"
        className="sr-only"
        onChange={handleFileSelected}
      />

      <Separator />
      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">Prompt de transcrição</Label>
        <Textarea
          disabled={status !== "waiting"}
          ref={promptInputRef}
          id="transcription_prompt"
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chave mencionadas no video separadas por vírgula (,)"
        />
        <Button
          disabled={status !== "waiting"}
          type="submit"
          className="w-full data-[success=true]:bg-green-500"
        >
          {status === "waiting" ? (
            <Fragment>
              Carregar vídeo
              <Upload className="w-4 h-4 ml-2" />
            </Fragment>
          ) : (
            statusMessages[status]
          )}
        </Button>
      </div>
    </form>
  );
}
