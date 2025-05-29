import {Component, HostListener, input, OnDestroy, OnInit, signal, effect} from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import {
    LocalVideoTrack,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Room,
    RoomEvent,
} from 'livekit-client';

import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import {VideoComponent} from "../video/video.component";
import {AudioComponent} from "../audio/audio.component";
import {NgClass} from "@angular/common";

type TrackInfo = {
    trackPublication: RemoteTrackPublication;
    participantIdentity: string;
};

// When running OpenVidu locally, leave these variables empty
// For other deployment type, configure them with correct URLs depending on your deployment
let APPLICATION_SERVER_URL = '';
let LIVEKIT_URL = 'wss://tslen-sihva4bl.livekit.cloud';
@Component({
    selector: 'app-wellcome',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        VideoComponent,
        AudioComponent,
        NgClass,
    ],
    templateUrl: './wellcome.component.html',
    styleUrl: './wellcome.component.css'
})
export class WellcomeComponent implements OnDestroy, OnInit {
    roomForm = new FormGroup({
        roomName: new FormControl( '' + Date.now(), Validators.required),
        participantName: new FormControl('Participant' + Math.floor(Math.random() * 100), Validators.required),
    });

    room = signal<Room | undefined>(undefined);
    localTrack = signal<LocalVideoTrack | undefined>(undefined);
    remoteTracksMap = signal<Map<string, TrackInfo>>(new Map());
    // input from route
    id = input<string | null>();
    cameraIsEnable = signal<boolean>(true);
    screenShareEnabled = signal<boolean>(false);
    microphoneEnabled = signal<boolean>(true);

    constructor(private httpClient: HttpClient) {
        this.configureUrls();
    }
    ngOnInit() {
        console.log('test id ', this.id());
        // If the id is provided in the route, set it as the room name
        if (this.id()) {
            this.roomForm.patchValue({ roomName: this.id() });
                    // this.joinRoom()
        }
    }

    configureUrls() {
        // If APPLICATION_SERVER_URL is not configured, use default value from OpenVidu Local deployment
        if (!APPLICATION_SERVER_URL) {
            if (window.location.hostname === 'localhost') {
                APPLICATION_SERVER_URL = 'http://localhost:6080/';
            } else {
                APPLICATION_SERVER_URL = 'https://' + window.location.hostname + ':6443/';
            }
        }

        // If LIVEKIT_URL is not configured, use default value from OpenVidu Local deployment
        if (!LIVEKIT_URL) {
            if (window.location.hostname === 'localhost') {
                LIVEKIT_URL = 'ws://localhost:7880/';
            } else {
                LIVEKIT_URL = 'wss://' + window.location.hostname + ':7443/';
            }
        }
    }

    async joinRoom() {
        // Initialize a new Room object
        const room = new Room();
        this.room.set(room);

        // Specify the actions when events take place in the room
        // On every new Track received...
        room.on(
            RoomEvent.TrackSubscribed,
            (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
                this.remoteTracksMap.update((map) => {
                    map.set(publication.trackSid, {
                        trackPublication: publication,
                        participantIdentity: participant.identity,
                    });
                    return map;
                });
            }
        );

        // On every new Track destroyed...
        room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, publication: RemoteTrackPublication) => {
            this.remoteTracksMap.update((map) => {
                map.delete(publication.trackSid);
                return map;
            });
        });

        try {
            // Get the room name and participant name from the form
            const roomName = this.roomForm.value.roomName!;
            const participantName = this.roomForm.value.participantName!;

            // Get a token from your application server with the room name and participant name
            const token = await this.getToken(roomName, participantName);

            // Connect to the room with the LiveKit URL and the token
            await room.connect(LIVEKIT_URL, token);

            // Publish your camera and microphone
            await room.localParticipant.enableCameraAndMicrophone();
            this.localTrack.set(room.localParticipant.videoTrackPublications.values().next().value.videoTrack);
            // add this.id to url params
            window.history.pushState({}, '', `/${roomName}`);
        } catch (error: any) {
            console.log(
                'There was an error connecting to the room:',
                error?.error?.errorMessage || error?.message || error
            );
            await this.leaveRoom();
        }
    }

    async leaveRoom() {
        // Leave the room by calling 'disconnect' method over the Room object
        await this.room()?.disconnect();

        // Reset all variables
        this.room.set(undefined);
        this.localTrack.set(undefined);
        this.remoteTracksMap.set(new Map());
    }
    async setCameraEnabled(value: boolean) {
        const room = this.room();
        if (room){
            const p = room.localParticipant;
            await p.setCameraEnabled(value);
            this.cameraIsEnable.set(value);
        }
    }
    async setScreenShareEnabled(value: boolean) {

        const room = this.room();
        if (room) {
            const p = room.localParticipant;
            if (value) {
                // start sharing the user's screen, this will trigger a browser prompt to select
                // the screen to share.
                await p.setScreenShareEnabled(true);
            } else {
                // stop sharing the user's screen
                await p.setScreenShareEnabled(false);
            }
            this.screenShareEnabled.set(value);
        }
    }
    async setMicrophoneEnabled(value: boolean) {

        const room = this.room();
        if (room) {
            const p = room.localParticipant;
            await p.setMicrophoneEnabled(value);
            this.microphoneEnabled.set(value);
        }
    }

    @HostListener('window:beforeunload')
    async ngOnDestroy() {
        // On window closed or component destroyed, leave the room
        await this.leaveRoom();
    }

    /**
     * --------------------------------------------
     * GETTING A TOKEN FROM YOUR APPLICATION SERVER
     * --------------------------------------------
     * The method below request the creation of a token to
     * your application server. This prevents the need to expose
     * your LiveKit API key and secret to the client side.
     *
     * In this sample code, there is no user control at all. Anybody could
     * access your application server endpoints. In a real production
     * environment, your application server must identify the user to allow
     * access to the endpoints.
     */
    async getToken(roomName: string, participantName: string): Promise<string> {
        const response = await lastValueFrom(
            this.httpClient.post<{ token: string }>(APPLICATION_SERVER_URL + 'token', { roomName, participantName })
        );
        return response.token;
    }
}
