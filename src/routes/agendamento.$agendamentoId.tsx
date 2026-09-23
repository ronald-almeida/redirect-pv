import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  CalendarCheck,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageCircle,
  CalendarX,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/confirmar/$agendamentoId")({
  head: () => ({
    meta: [
      { title: "Confirmar agendamento" },
      {
        name: "description",
        content: "Confirme seu novo horário de atendimento.",
      },
    ],
  }),
  component: ConfirmarAgendamento,
});

// Tipos
interface Appointment {
  id: string;
  clientName: string;
  date: string; // ISO date, ex: 2026-09-15
  time: string; // ex: 14:30
  service: string;
  professionalName?: string;
}

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; appointment: Appointment }
  | { status: "confirmed"; appointment: Appointment }
  | { status: "reschedule"; appointment: Appointment };

// Simulação de busca por ID. Substitua por chamada real quando houver backend.
function fetchAppointment(id: string): Promise<Appointment> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!id || id.length < 3) {
        reject(new Error("Agendamento não encontrado ou link expirado."));
        return;
      }

      // Gera dados determinísticos a partir do ID para simulação consistente
      const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const daysOffset = (hash % 14) + 1;
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + daysOffset);
      const date = baseDate.toISOString().split("T")[0];

      const hours = 8 + (hash % 11); // 8h às 18h
      const minutes = (hash % 2) * 30; // 00 ou 30
      const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

      const firstNames = ["Ana", "Carlos", "Fernanda", "João", "Mariana", "Pedro", "Juliana", "Lucas"];
      const lastNames = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Costa", "Pereira", "Almeida"];
      const clientName = `${firstNames[hash % firstNames.length]} ${lastNames[(hash >> 4) % lastNames.length]}`;

      resolve({
        id,
        clientName,
        date,
        time,
        service: "Atendimento",
        professionalName: "Equipe",
      });
    }, 900);
  });
}

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ConfirmarAgendamento() {
  const { agendamentoId } = Route.useParams();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchAppointment(agendamentoId)
      .then((appointment) => {
        if (!cancelled) setState({ status: "ready", appointment });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [agendamentoId]);

  const handleConfirm = async () => {
    if (state.status !== "ready") return;

    setState({ status: "loading" });

    // Simula chamada de API de confirmação. Substitua por fetch real quando houver backend.
    await new Promise((resolve) => setTimeout(resolve, 700));

    setState({ status: "confirmed", appointment: state.appointment });
  };

  const handleRescheduleOpen = () => {
    if (state.status !== "ready") return;
    setState({ status: "reschedule", appointment: state.appointment });
  };

  const handleBack = () => {
    if (state.status !== "reschedule") return;
    setState({ status: "ready", appointment: state.appointment });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111827]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8 sm:justify-center">
        <div className="w-full rounded-3xl bg-white p-6 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] ring-1 ring-[#E5E7EB] sm:p-8">
          {state.status === "loading" && <LoadingState />}
          {state.status === "error" && <ErrorState message={state.message} />}
          {state.status === "ready" && (
            <ReadyState
              appointment={state.appointment}
              onConfirm={handleConfirm}
              onReschedule={handleRescheduleOpen}
            />
          )}
          {state.status === "confirmed" && <ConfirmedState appointment={state.appointment} />}
          {state.status === "reschedule" && (
            <RescheduleState appointment={state.appointment} onBack={handleBack} />
          )}
        </div>

        <footer className="mt-6 text-center text-xs text-[#9CA3AF]">
          Big Cloak • Confirmação de agendamento
        </footer>
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#13C286]" />
      <p className="mt-4 text-sm font-medium text-[#374151]">Buscando seu agendamento...</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE2E2]">
        <AlertCircle className="h-7 w-7 text-[#EF4444]" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-[#111827]">Agendamento não encontrado</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{message}</p>
      <p className="mt-4 text-xs text-[#9CA3AF]">
        Se o problema persistir, entre em contato pelo WhatsApp da empresa.
      </p>
    </div>
  );
}

function ReadyState({
  appointment,
  onConfirm,
  onReschedule,
}: {
  appointment: Appointment;
  onConfirm: () => void;
  onReschedule: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D1FAE5] text-[#059669]">
          <CalendarCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight text-[#111827]">
            Confirme seu atendimento
          </h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">Verifique os dados abaixo</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[#F9FAFB] p-4 ring-1 ring-[#E5E7EB]">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-[#9CA3AF]" />
          <span className="text-sm font-medium text-[#374151]">{appointment.clientName}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-[#E5E7EB]">
          <div className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#13C286]" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Data</p>
              <p className="text-base font-semibold text-[#111827] capitalize">
                {formatDate(appointment.date)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#13C286]" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Horário</p>
              <p className="text-base font-semibold text-[#111827]">{appointment.time}</p>
            </div>
          </div>
        </div>

        {appointment.professionalName && (
          <p className="mt-3 text-xs text-[#6B7280]">
            Profissional: <span className="font-medium text-[#374151]">{appointment.professionalName}</span>
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={onConfirm}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#13C286] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#10B37F] active:scale-[0.99]"
        >
          <CheckCircle2 className="h-5 w-5" />
          Confirmar presença
        </button>

        <button
          onClick={onReschedule}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB] active:scale-[0.99]"
        >
          <CalendarX className="h-4 w-4" />
          Não posso comparecer / Remarcar
        </button>
      </div>
    </div>
  );
}

function ConfirmedState({ appointment }: { appointment: Appointment }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D1FAE5]">
        <CheckCircle2 className="h-9 w-9 text-[#059669]" />
      </div>

      <h1 className="mt-5 text-xl font-semibold text-[#111827]">Presença confirmada!</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
        Te esperamos no dia{" "}
        <span className="font-semibold text-[#111827]">{formatDate(appointment.date)}</span>{" "}
        às <span className="font-semibold text-[#111827]">{appointment.time}</span>.
      </p>

      <div className="mt-6 w-full rounded-xl bg-[#F0FDF4] p-4 text-left ring-1 ring-[#BBF7D0]">
        <p className="text-xs font-medium uppercase tracking-wide text-[#059669]">Lembrete</p>
        <p className="mt-1 text-sm text-[#166534]">
          Chegue com 10 minutos de antecedência. Se precisar remarcar, nos avise com pelo menos 24h de
          antecedência.
        </p>
      </div>

      <p className="mt-6 text-xs text-[#9CA3AF]">
        Obrigado, {appointment.clientName.split(" ")[0]}!
      </p>
    </div>
  );
}

function RescheduleState({
  appointment,
  onBack,
}: {
  appointment: Appointment;
  onBack: () => void;
}) {
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simula envio. Substitua por API real quando houver backend.
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DBEAFE]">
          <MessageCircle className="h-7 w-7 text-[#3B82F6]" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-[#111827]">Solicitação enviada</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
          Recebemos seu pedido sobre o agendamento de{" "}
          <span className="font-medium text-[#111827]">{formatDate(appointment.date)}</span> às{" "}
          <span className="font-medium text-[#111827]">{appointment.time}</span>. Nossa equipe entrará em
          contato para remarcar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        onClick={onBack}
        className="mb-4 flex w-fit items-center gap-1 text-sm font-medium text-[#6B7280] hover:text-[#111827]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h1 className="text-lg font-semibold text-[#111827]">Remarcar ou cancelar</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Informe o motivo e a melhor forma de contato. Nossa equipe responderá em breve.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-[#374151]">
            Nome
          </label>
          <input
            id="name"
            type="text"
            defaultValue={appointment.clientName}
            className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#13C286] focus:outline-none focus:ring-2 focus:ring-[#13C286]/20"
            placeholder="Seu nome"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-medium text-[#374151]">
            WhatsApp / Telefone
          </label>
          <input
            id="phone"
            type="tel"
            className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#13C286] focus:outline-none focus:ring-2 focus:ring-[#13C286]/20"
            placeholder="(00) 00000-0000"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-xs font-medium text-[#374151]">
            Mensagem
          </label>
          <textarea
            id="message"
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:border-[#13C286] focus:outline-none focus:ring-2 focus:ring-[#13C286]/20"
            placeholder="Informe o motivo e a nova preferência de data/horário"
          />
        </div>

        <button
          type="submit"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1F2937] active:scale-[0.99]"
        >
          Enviar solicitação
        </button>
      </form>
    </div>
  );
}
