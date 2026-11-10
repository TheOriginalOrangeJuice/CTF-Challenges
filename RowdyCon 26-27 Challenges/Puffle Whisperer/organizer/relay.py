"""Condev-only loopback relay for testing the published localhost URL."""
import asyncio

async def relay(reader,writer):
    remote_writer=None
    tasks=[]
    try:
        remote_reader,remote_writer=await asyncio.open_connection("host.docker.internal",18116)
        async def pump(source,destination):
            while data:=await source.read(65536):
                destination.write(data)
                await destination.drain()
        tasks=[asyncio.create_task(pump(reader,remote_writer)),asyncio.create_task(pump(remote_reader,writer))]
        _,pending=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
        for task in pending:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
    except (OSError,asyncio.CancelledError):
        for task in tasks:task.cancel()
    finally:
        writer.close()
        if remote_writer:remote_writer.close()

async def main():
    server=await asyncio.start_server(relay,"127.0.0.1",18116)
    print("Condev loopback18116 -> published Docker host18116; task-owned test relay",flush=True)
    async with server:await server.serve_forever()

asyncio.run(main())
